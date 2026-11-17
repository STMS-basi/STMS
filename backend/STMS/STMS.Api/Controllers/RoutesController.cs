
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using STMS.Api.DTOs.Routes;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/routes")]
  public class RoutesController : ControllerBase
  {
    private readonly AppDbContext _context;

    public RoutesController(AppDbContext context)
    {
      _context = context;
    }

    // GET /api/routes
    [HttpGet]
    public async Task<IActionResult> GetRoutes(
        [FromQuery] string? search,
        [FromQuery] string? area)
    {
      var query = _context.Routes.AsNoTracking();

      if (!string.IsNullOrWhiteSpace(search))
      {
        var keyword = search.Trim().ToLower();

        query = query.Where(r =>
            r.Name.ToLower().Contains(keyword) ||
            r.RouteNumber.ToLower().Contains(keyword) ||
            r.StartPoint.ToLower().Contains(keyword) ||
            r.Destination.ToLower().Contains(keyword));
      }

      if (!string.IsNullOrWhiteSpace(area))
      {
        var selectedArea = area.Trim().ToLower();

        query = query.Where(r =>
            r.ServiceArea.ToLower() == selectedArea);
      }

      var routes = await query
          .OrderBy(r => r.RouteNumber)
          .Select(r => new
          {
            r.RouteId,
            r.RouteNumber,
            r.Name,
            r.StartPoint,
            r.Destination,
            r.ServiceArea,
            r.Capacity,
            r.BusId,
            r.DriverId,
            r.IsActive
          })
          .ToListAsync();

      return Ok(routes);
    }

    // GET /api/routes/areas
    [HttpGet("areas")]
    public async Task<IActionResult> GetAreas()
    {
      var routes = await _context.Routes
          .AsNoTracking()
          .ToListAsync();

      var areas = routes
          .Select(r => r.ServiceArea)
          .Where(area => !string.IsNullOrWhiteSpace(area))
          .Distinct(StringComparer.OrdinalIgnoreCase)
          .OrderBy(area => area)
          .ToList();

      return Ok(areas);
    }

    // GET /api/routes/{id}
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetRouteById(int id)
    {
      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      var stops = await _context.Stops
          .AsNoTracking()
          .Where(s => s.RouteId == id)
          .OrderBy(s => s.StopOrder)
          .Select(s => new
          {
            s.StopId,
            s.Name,
            s.StopOrder,
            s.PickupTime,
            s.DropoffTime
          })
          .ToListAsync();

      return Ok(new
      {
        route.RouteId,
        route.RouteNumber,
        route.Name,
        route.StartPoint,
        route.Destination,
        route.ServiceArea,
        route.Capacity,
        route.BusId,
        route.DriverId,
        route.IsActive,
        Stops = stops
      });
    }

    // GET /api/routes/admin
    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllRoutesForAdmin()
    {
      var routes = await _context.Routes
          .AsNoTracking()
          .OrderBy(r => r.RouteNumber)
          .Select(r => new
          {
            r.RouteId,
            r.RouteNumber,
            r.Name,
            r.StartPoint,
            r.Destination,
            r.ServiceArea,
            r.Capacity,
            r.BusId,
            r.DriverId,
            r.IsActive
          })
          .ToListAsync();

      return Ok(routes);
    }

    // POST /api/routes/admin
    [HttpPost("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateRoute(
        [FromBody] CreateRouteRequest request)
    {
      if (string.IsNullOrWhiteSpace(request.RouteNumber) ||
          string.IsNullOrWhiteSpace(request.Name) ||
          string.IsNullOrWhiteSpace(request.StartPoint) ||
          string.IsNullOrWhiteSpace(request.Destination) ||
          string.IsNullOrWhiteSpace(request.ServiceArea))
      {
        return BadRequest(new
        {
          message = "All route fields are required."
        });
      }

      if (request.Capacity <= 0)
      {
        return BadRequest(new
        {
          message = "Capacity must be greater than zero."
        });
      }

      var routeNumber = request.RouteNumber.Trim();

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      if (request.BusId.HasValue)
      {
        var busLocked =
            await LockBusAsync(request.BusId.Value);

        if (!busLocked)
        {
          return BadRequest(new
          {
            message = "Bus not found or inactive."
          });
        }

        var assignedBus = await _context.Buses
            .AsNoTracking()
            .FirstOrDefaultAsync(b =>
                b.BusId == request.BusId.Value);

        if (assignedBus == null || !assignedBus.IsActive)
        {
          return BadRequest(new
          {
            message = "Bus not found or inactive."
          });
        }

        if (assignedBus.Capacity < request.Capacity)
        {
          return BadRequest(new
          {
            message =
                  "Bus capacity cannot be smaller than route capacity."
          });
        }

        // Check active bus assignments in C#.
        // Avoid Oracle Boolean translation issues.
        var busRoutes = await _context.Routes
            .AsNoTracking()
            .Where(r => r.BusId == request.BusId.Value)
            .ToListAsync();

        var busAlreadyAssigned =
            busRoutes.Any(r => r.IsActive);

        if (busAlreadyAssigned)
        {
          return Conflict(new
          {
            message =
                  "Bus is already assigned to another active route."
          });
        }
      }

      var exists = await _context.Routes
          .AnyAsync(r => r.RouteNumber == routeNumber);

      if (exists)
      {
        return Conflict(new
        {
          message = "Route number already exists."
        });
      }

      if (request.DriverId.HasValue)
      {
        // FIX: Fetch driver first, then check IsActive in C#.
        var assignedDriver = await _context.Drivers
            .AsNoTracking()
            .FirstOrDefaultAsync(d =>
                d.DriverId == request.DriverId.Value);

        if (assignedDriver == null || !assignedDriver.IsActive)
        {
          return BadRequest(new
          {
            message = "Driver not found or inactive."
          });
        }
      }

      var route = new STMS.Core.Entities.Route
      {
        RouteNumber = routeNumber,
        Name = request.Name.Trim(),
        StartPoint = request.StartPoint.Trim(),
        Destination = request.Destination.Trim(),
        ServiceArea = request.ServiceArea.Trim(),
        Capacity = request.Capacity,
        BusId = request.BusId,
        DriverId = request.DriverId,
        IsActive = request.BusId.HasValue
      };

      _context.Routes.Add(route);

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return StatusCode(201, new
      {
        message = "Route created successfully.",
        routeId = route.RouteId,
        routeNumber = route.RouteNumber,
        isActive = route.IsActive
      });
    }

    // PUT /api/routes/admin/{id}
    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateRoute(
        int id,
        [FromBody] UpdateRouteRequest request)
    {
      if (string.IsNullOrWhiteSpace(request.RouteNumber) ||
          string.IsNullOrWhiteSpace(request.Name) ||
          string.IsNullOrWhiteSpace(request.StartPoint) ||
          string.IsNullOrWhiteSpace(request.Destination) ||
          string.IsNullOrWhiteSpace(request.ServiceArea))
      {
        return BadRequest(new
        {
          message = "All route fields are required."
        });
      }

      if (request.Capacity <= 0)
      {
        return BadRequest(new
        {
          message = "Capacity must be greater than zero."
        });
      }

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock requested bus before route.
      if (request.BusId.HasValue)
      {
        var busLocked =
            await LockBusAsync(request.BusId.Value);

        if (!busLocked)
        {
          return BadRequest(new
          {
            message = "Bus not found or inactive."
          });
        }
      }

      var routeExists = await LockRouteAsync(id);

      if (!routeExists)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      var route = await _context.Routes
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      if (route.IsActive && !request.BusId.HasValue)
      {
        return Conflict(new
        {
          message =
                "Cannot remove the bus from an active route. Deactivate the route first."
        });
      }

      var routeNumber = request.RouteNumber.Trim();

      var duplicateExists = await _context.Routes
          .AnyAsync(r =>
              r.RouteNumber == routeNumber &&
              r.RouteId != id);

      if (duplicateExists)
      {
        return Conflict(new
        {
          message = "Route number already exists."
        });
      }

      if (request.BusId.HasValue)
      {
        var assignedBus = await _context.Buses
            .AsNoTracking()
            .FirstOrDefaultAsync(b =>
                b.BusId == request.BusId.Value);

        if (assignedBus == null || !assignedBus.IsActive)
        {
          return BadRequest(new
          {
            message = "Bus not found or inactive."
          });
        }

        if (assignedBus.Capacity < request.Capacity)
        {
          return BadRequest(new
          {
            message =
                  "Bus capacity cannot be smaller than route capacity."
          });
        }

        // Only active routes must have an exclusive bus.
        if (route.IsActive)
        {
          var busRoutes = await _context.Routes
              .AsNoTracking()
              .Where(r =>
                  r.BusId == request.BusId.Value &&
                  r.RouteId != id)
              .ToListAsync();

          var busAlreadyAssigned =
              busRoutes.Any(r => r.IsActive);

          if (busAlreadyAssigned)
          {
            return Conflict(new
            {
              message =
                    "Bus is already assigned to another active route."
            });
          }
        }
      }

      if (request.DriverId.HasValue)
      {
        // FIX: Avoid AnyAsync with IsActive.
        var assignedDriver = await _context.Drivers
            .AsNoTracking()
            .FirstOrDefaultAsync(d =>
                d.DriverId == request.DriverId.Value);

        if (assignedDriver == null || !assignedDriver.IsActive)
        {
          return BadRequest(new
          {
            message = "Driver not found or inactive."
          });
        }
      }

      // Protect existing reservations by semester.
      var maxReservedSeats =
          await GetMaximumProtectedReservationsAsync(id);

      if (request.Capacity < maxReservedSeats)
      {
        return Conflict(new
        {
          message =
                "Route capacity cannot be smaller than existing reservations for an active or future semester.",
          minimumCapacity = maxReservedSeats
        });
      }

      route.RouteNumber = routeNumber;
      route.Name = request.Name.Trim();
      route.StartPoint = request.StartPoint.Trim();
      route.Destination = request.Destination.Trim();
      route.ServiceArea = request.ServiceArea.Trim();
      route.Capacity = request.Capacity;
      route.BusId = request.BusId;
      route.DriverId = request.DriverId;

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Route updated successfully.",
        routeId = route.RouteId,
        routeNumber = route.RouteNumber
      });
    }

    // PATCH /api/routes/admin/{id}/deactivate
    [HttpPatch("admin/{id:int}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeactivateRoute(int id)
    {
      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      var routeExists = await LockRouteAsync(id);

      if (!routeExists)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      var route = await _context.Routes
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      if (!route.IsActive)
      {
        return Conflict(new
        {
          message = "Route is already inactive."
        });
      }

      var hasActiveSubscriptions =
          await _context.Subscriptions.AnyAsync(s =>
              s.RouteId == id &&
              (s.Status == "Pending" ||
               s.Status == "Approved"));

      if (hasActiveSubscriptions)
      {
        return Conflict(new
        {
          message =
                "Cannot deactivate a route with pending or approved subscriptions."
        });
      }

      route.IsActive = false;

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Route deactivated successfully.",
        routeId = route.RouteId,
        isActive = route.IsActive
      });
    }

    // PATCH /api/routes/admin/{id}/activate
    [HttpPatch("admin/{id:int}/activate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ActivateRoute(int id)
    {
      var routeSnapshot = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (routeSnapshot == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      if (!routeSnapshot.BusId.HasValue)
      {
        return Conflict(new
        {
          message =
                "Cannot activate a route without an assigned bus."
        });
      }

      var expectedBusId = routeSnapshot.BusId.Value;

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock bus before route.
      var busLocked = await LockBusAsync(expectedBusId);

      if (!busLocked)
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned bus is missing."
        });
      }

      var routeExists = await LockRouteAsync(id);

      if (!routeExists)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      var route = await _context.Routes
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      if (route.BusId != expectedBusId)
      {
        return Conflict(new
        {
          message =
                "Route bus assignment changed. Please retry activation."
        });
      }

      if (route.IsActive)
      {
        return Conflict(new
        {
          message = "Route is already active."
        });
      }

      var assignedBus = await _context.Buses
          .AsNoTracking()
          .FirstOrDefaultAsync(b =>
              b.BusId == expectedBusId);

      if (assignedBus == null || !assignedBus.IsActive)
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned bus is inactive or missing."
        });
      }

      if (assignedBus.Capacity < route.Capacity)
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned bus capacity is insufficient."
        });
      }

      // Prevent two active routes sharing one bus.
      var busRoutes = await _context.Routes
          .AsNoTracking()
          .Where(r =>
              r.BusId == expectedBusId &&
              r.RouteId != id)
          .ToListAsync();

      var busAlreadyAssigned =
          busRoutes.Any(r => r.IsActive);

      if (busAlreadyAssigned)
      {
        return Conflict(new
        {
          message =
                "Bus is already assigned to another active route."
        });
      }

      if (route.DriverId.HasValue)
      {
        // FIX: Check driver status after loading the entity.
        var assignedDriver = await _context.Drivers
            .AsNoTracking()
            .FirstOrDefaultAsync(d =>
                d.DriverId == route.DriverId.Value);

        if (assignedDriver == null || !assignedDriver.IsActive)
        {
          return BadRequest(new
          {
            message =
                  "Cannot activate route because its assigned driver is inactive or missing."
          });
        }
      }

      var maxReservedSeats =
          await GetMaximumProtectedReservationsAsync(id);

      if (route.Capacity < maxReservedSeats)
      {
        return Conflict(new
        {
          message =
                "Cannot activate route because its capacity is smaller than existing reservations.",
          minimumCapacity = maxReservedSeats
        });
      }

      route.IsActive = true;

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Route activated successfully.",
        routeId = route.RouteId,
        isActive = route.IsActive
      });
    }

    // ============================================
    // HELPERS
    // ============================================

    // Maximum protected reservations in one semester.
    private async Task<int> GetMaximumProtectedReservationsAsync(
        int routeId)
    {
      var today = DateTime.Today;

      var reservationsBySemester =
          await _context.Subscriptions
              .AsNoTracking()
              .Where(s =>
                  s.RouteId == routeId &&
                  s.EndDate >= today &&
                  (s.Status == "Pending" ||
                   s.Status == "Approved"))
              .GroupBy(s => new
              {
                s.StartDate,
                s.EndDate
              })
              .Select(g => g.Count())
              .ToListAsync();

      return reservationsBySemester.Count == 0
          ? 0
          : reservationsBySemester.Max();
    }

    // Lock bus row in Oracle.
    private async Task<bool> LockBusAsync(int busId)
    {
      var currentTransaction =
          _context.Database.CurrentTransaction
          ?? throw new InvalidOperationException(
              "An active transaction is required.");

      var connection = _context.Database.GetDbConnection();

      await using var command = connection.CreateCommand();

      command.Transaction =
          currentTransaction.GetDbTransaction();

      command.CommandText =
          "SELECT BUSID FROM BUSES " +
          "WHERE BUSID = :id FOR UPDATE";

      command.CommandTimeout = 30;

      var parameter = command.CreateParameter();
      parameter.ParameterName = "id";
      parameter.Value = busId;

      command.Parameters.Add(parameter);

      await using var reader =
          await command.ExecuteReaderAsync();

      return await reader.ReadAsync();
    }

    // Lock route row in Oracle.
    private async Task<bool> LockRouteAsync(int routeId)
    {
      var currentTransaction =
          _context.Database.CurrentTransaction
          ?? throw new InvalidOperationException(
              "An active transaction is required.");

      var connection = _context.Database.GetDbConnection();

      await using var command = connection.CreateCommand();

      command.Transaction =
          currentTransaction.GetDbTransaction();

      command.CommandText =
          "SELECT ROUTEID FROM ROUTES " +
          "WHERE ROUTEID = :id FOR UPDATE";

      command.CommandTimeout = 30;

      var parameter = command.CreateParameter();
      parameter.ParameterName = "id";
      parameter.Value = routeId;

      command.Parameters.Add(parameter);

      await using var reader =
          await command.ExecuteReaderAsync();

      return await reader.ReadAsync();
    }
  }
}
