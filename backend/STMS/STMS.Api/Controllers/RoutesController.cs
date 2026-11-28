
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using STMS.Api.DTOs.Routes;
using STMS.Infrastructure.Data;
using System.Globalization;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/routes")]
  public class RoutesController : ControllerBase
  {
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public RoutesController(
        AppDbContext context,
        IConfiguration configuration)
    {
      _context = context;
      _configuration = configuration;
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

      var semester = GetRegistrationSemester();

      var reservations = new Dictionary<int, int>();

      if (semester.HasValue && routes.Count > 0)
      {
        var semesterStart = semester.Value.StartDate;
        var semesterEnd = semester.Value.EndDate;

        reservations = await _context.Subscriptions
            .AsNoTracking()
            .Where(s =>
                s.StartDate <= semesterEnd &&
                s.EndDate >= semesterStart &&
                (s.Status == "Pending" ||
                 s.Status == "AwaitingPayment" ||
                 s.Status == "Approved"))
            .GroupBy(s => s.RouteId)
            .Select(g => new
            {
              RouteId = g.Key,
              Count = g.Count()
            })
            .ToDictionaryAsync(
                g => g.RouteId,
                g => g.Count);
      }

      return Ok(routes.Select(r =>
      {
        var reserved = reservations.TryGetValue(
            r.RouteId, out var count)
            ? count
            : 0;

        return new
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
          r.IsActive,

          registrationOpen = semester.HasValue,

          semesterStart = semester?.StartDate,

          semesterEnd = semester?.EndDate,

          reservedSeats = semester.HasValue
                ? (int?)reserved
                : null,

          remainingSeats = semester.HasValue
                ? (int?)Math.Max(
                    0, r.Capacity - reserved)
                : null
        };
      }).ToList());
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
          .Where(area =>
              !string.IsNullOrWhiteSpace(area))
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

      // A route may be active only when both
      // a bus and a driver are assigned.

      // When either assignment is missing,
      // create the route as inactive.

      var shouldBeActive =
          request.BusId.HasValue &&
          request.DriverId.HasValue;

      var routeNumber = request.RouteNumber.Trim();

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock order: bus, then driver.

      if (request.BusId.HasValue)
      {
        if (!await LockBusAsync(request.BusId.Value))
        {
          return BadRequest(new
          {
            message = "Bus not found."
          });
        }

        var bus = await _context.Buses
            .AsNoTracking()
            .FirstOrDefaultAsync(b =>
                b.BusId == request.BusId.Value);

        if (bus == null)
        {
          return BadRequest(new
          {
            message = "Bus not found."
          });
        }

        if (shouldBeActive && !bus.IsActive)
        {
          return BadRequest(new
          {
            message =
                  "Cannot activate a route with an inactive bus."
          });
        }

        if (bus.Capacity < request.Capacity)
        {
          return BadRequest(new
          {
            message =
                  "Bus capacity cannot be smaller than route capacity."
          });
        }

        if (shouldBeActive)
        {
          var busRoutes = await _context.Routes
              .AsNoTracking()
              .Where(r =>
                  r.BusId == request.BusId.Value)
              .Select(r => new { r.IsActive })
              .ToListAsync();

          if (busRoutes.Any(r => r.IsActive))
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
        if (!await LockDriverAsync(
            request.DriverId.Value))
        {
          return BadRequest(new
          {
            message = "Driver not found."
          });
        }

        var driver = await _context.Drivers
            .AsNoTracking()
            .FirstOrDefaultAsync(d =>
                d.DriverId == request.DriverId.Value);

        if (driver == null)
        {
          return BadRequest(new
          {
            message = "Driver not found."
          });
        }

        if (shouldBeActive && !driver.IsActive)
        {
          return BadRequest(new
          {
            message =
                  "Cannot activate a route with an inactive driver."
          });
        }

        if (shouldBeActive &&
            await HasOtherActiveDriverRouteAsync(
                request.DriverId.Value))
        {
          return Conflict(new
          {
            message =
                  "Driver is already assigned to another active route."
          });
        }
      }

      var duplicate = await _context.Routes
          .AnyAsync(r => r.RouteNumber == routeNumber);

      if (duplicate)
      {
        return Conflict(new
        {
          message = "Route number already exists."
        });
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
        IsActive = shouldBeActive
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

      // Lock order: bus, driver, route.

      if (request.BusId.HasValue &&
          !await LockBusAsync(request.BusId.Value))
      {
        return BadRequest(new
        {
          message = "Bus not found."
        });
      }

      if (request.DriverId.HasValue &&
          !await LockDriverAsync(request.DriverId.Value))
      {
        return BadRequest(new
        {
          message = "Driver not found."
        });
      }

      if (!await LockRouteAsync(id))
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

      // An active route must always retain
      // both its bus and its driver.

      if (route.IsActive &&
          (!request.BusId.HasValue ||
           !request.DriverId.HasValue))
      {
        return Conflict(new
        {
          message =
                "An active route must have both an assigned bus and an assigned driver. Deactivate the route before removing either assignment."
        });
      }

      // Protect route details for current
      // and future semesters.

      var hasProtectedSubscriptions =
          await HasProtectedSubscriptionsAsync(id);

      if (hasProtectedSubscriptions &&
          (!string.Equals(
              route.StartPoint,
              request.StartPoint.Trim(),
              StringComparison.Ordinal) ||
           !string.Equals(
              route.Destination,
              request.Destination.Trim(),
              StringComparison.Ordinal) ||
           !string.Equals(
              route.ServiceArea,
              request.ServiceArea.Trim(),
              StringComparison.Ordinal)))
      {
        return Conflict(new
        {
          message =
                "Cannot change route start point, destination or service area while protected subscriptions exist."
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
        var bus = await _context.Buses
            .AsNoTracking()
            .FirstOrDefaultAsync(b =>
                b.BusId == request.BusId.Value);

        if (bus == null)
        {
          return BadRequest(new
          {
            message = "Bus not found."
          });
        }

        if (route.IsActive && !bus.IsActive)
        {
          return BadRequest(new
          {
            message =
                  "Cannot assign an inactive bus to an active route."
          });
        }

        if (bus.Capacity < request.Capacity)
        {
          return BadRequest(new
          {
            message =
                  "Bus capacity cannot be smaller than route capacity."
          });
        }

        if (route.IsActive)
        {
          var busRoutes = await _context.Routes
              .AsNoTracking()
              .Where(r =>
                  r.BusId == request.BusId.Value &&
                  r.RouteId != id)
              .Select(r => new { r.IsActive })
              .ToListAsync();

          if (busRoutes.Any(r => r.IsActive))
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
        var driver = await _context.Drivers
            .AsNoTracking()
            .FirstOrDefaultAsync(d =>
                d.DriverId == request.DriverId.Value);

        if (driver == null)
        {
          return BadRequest(new
          {
            message = "Driver not found."
          });
        }

        if (route.IsActive && !driver.IsActive)
        {
          return BadRequest(new
          {
            message =
                  "Cannot assign an inactive driver to an active route."
          });
        }

        if (route.IsActive &&
            await HasOtherActiveDriverRouteAsync(
                request.DriverId.Value, id))
        {
          return Conflict(new
          {
            message =
                  "Driver is already assigned to another active route."
          });
        }
      }

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

      // PUT does not change route active status.
      // Inactive routes remain inactive until
      // the activation endpoint is called.

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

      if (!await LockRouteAsync(id))
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

      if (await HasProtectedSubscriptionsAsync(id))
      {
        return Conflict(new
        {
          message =
                "Cannot deactivate a route with protected subscriptions."
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
      var snapshot = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (snapshot == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      // Both assignments are mandatory.

      if (!snapshot.BusId.HasValue ||
          !snapshot.DriverId.HasValue)
      {
        return Conflict(new
        {
          message =
                "Cannot activate a route without both an assigned bus and an assigned driver."
        });
      }

      int expectedBusId = snapshot.BusId.Value;
      int expectedDriverId = snapshot.DriverId.Value;

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock order: bus, driver, route.

      if (!await LockBusAsync(expectedBusId))
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned bus is missing."
        });
      }

      if (!await LockDriverAsync(expectedDriverId))
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned driver is missing."
        });
      }

      if (!await LockRouteAsync(id))
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

      if (route.BusId != expectedBusId ||
          route.DriverId != expectedDriverId)
      {
        return Conflict(new
        {
          message =
                "Route assignment changed. Please retry activation."
        });
      }

      if (route.IsActive)
      {
        return Conflict(new
        {
          message = "Route is already active."
        });
      }

      var bus = await _context.Buses
          .AsNoTracking()
          .FirstOrDefaultAsync(b =>
              b.BusId == expectedBusId);

      if (bus == null || !bus.IsActive)
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned bus is inactive or missing."
        });
      }

      if (bus.Capacity < route.Capacity)
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned bus capacity is insufficient."
        });
      }

      var busRoutes = await _context.Routes
          .AsNoTracking()
          .Where(r =>
              r.BusId == expectedBusId &&
              r.RouteId != id)
          .Select(r => new { r.IsActive })
          .ToListAsync();

      if (busRoutes.Any(r => r.IsActive))
      {
        return Conflict(new
        {
          message =
                "Bus is already assigned to another active route."
        });
      }

      var driver = await _context.Drivers
          .AsNoTracking()
          .FirstOrDefaultAsync(d =>
              d.DriverId == expectedDriverId);

      if (driver == null || !driver.IsActive)
      {
        return BadRequest(new
        {
          message =
                "Cannot activate route because its assigned driver is inactive or missing."
        });
      }

      if (await HasOtherActiveDriverRouteAsync(
          expectedDriverId, id))
      {
        return Conflict(new
        {
          message =
                "Driver is already assigned to another active route."
        });
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

    // ========================================
    // HELPERS
    // ========================================

    // Determine the semester currently
    // available for registration.

    private (DateTime StartDate, DateTime EndDate)?
        GetRegistrationSemester()
    {
      var registrationDays = _configuration.GetValue<int>(
          "SchoolSemesters:RegistrationOpenDaysBefore", 14);

      if (registrationDays < 0)
      {
        registrationDays = 14;
      }

      var today = DateTime.Today;

      var available =
          new List<(DateTime StartDate, DateTime EndDate)>();

      foreach (var section in _configuration
          .GetSection("SchoolSemesters:Semesters")
          .GetChildren())
      {
        var startText = section["StartDate"];
        var endText = section["EndDate"];

        if (!DateTime.TryParseExact(
                startText,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var start) ||

            !DateTime.TryParseExact(
                endText,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var end) ||

            end < start)
        {
          continue;
        }

        if (today >= start.AddDays(-registrationDays) &&
            today <= end)
        {
          available.Add((start, end));
        }
      }

      if (available.Count == 0)
      {
        return null;
      }

      return available
          .OrderByDescending(s => s.StartDate)
          .First();
    }

    private async Task<bool> HasProtectedSubscriptionsAsync(
        int routeId)
    {
      return await _context.Subscriptions
          .AsNoTracking()
          .AnyAsync(s =>
              s.RouteId == routeId &&
              s.EndDate >= DateTime.Today &&
              (s.Status == "Pending" ||
               s.Status == "AwaitingPayment" ||
               s.Status == "Approved"));
    }

    private async Task<int>
        GetMaximumProtectedReservationsAsync(int routeId)
    {
      var today = DateTime.Today;

      var counts = await _context.Subscriptions
          .AsNoTracking()
          .Where(s =>
              s.RouteId == routeId &&
              s.EndDate >= today &&
              (s.Status == "Pending" ||
               s.Status == "AwaitingPayment" ||
               s.Status == "Approved"))
          .GroupBy(s => new
          {
            s.StartDate,
            s.EndDate
          })
          .Select(g => g.Count())
          .ToListAsync();

      return counts.Count == 0
          ? 0
          : counts.Max();
    }

    private async Task<bool> HasOtherActiveDriverRouteAsync(
        int driverId,
        int? excludedRouteId = null)
    {
      var routes = await _context.Routes
          .AsNoTracking()
          .Where(r =>
              r.DriverId == driverId &&
              (!excludedRouteId.HasValue ||
               r.RouteId != excludedRouteId.Value))
          .Select(r => new
          {
            r.IsActive
          })
          .ToListAsync();

      return routes.Any(r => r.IsActive);
    }

    private async Task<bool> LockBusAsync(int busId)
    {
      return await LockRowAsync(
          "BUSES", "BUSID", busId);
    }

    private async Task<bool> LockDriverAsync(int driverId)
    {
      return await LockRowAsync(
          "DRIVERS", "DRIVERID", driverId);
    }

    private async Task<bool> LockRouteAsync(int routeId)
    {
      return await LockRowAsync(
          "ROUTES", "ROUTEID", routeId);
    }

    private async Task<bool> LockRowAsync(
        string tableName,
        string columnName,
        int id)
    {
      var transaction =
          _context.Database.CurrentTransaction
          ?? throw new InvalidOperationException(
              "An active transaction is required.");

      var connection =
          _context.Database.GetDbConnection();

      await using var command =
          connection.CreateCommand();

      command.Transaction =
          transaction.GetDbTransaction();

      command.CommandText =
          $"SELECT {columnName} FROM {tableName} " +
          $"WHERE {columnName} = :id FOR UPDATE";

      command.CommandTimeout = 30;

      var parameter = command.CreateParameter();

      parameter.ParameterName = "id";
      parameter.Value = id;

      command.Parameters.Add(parameter);

      await using var reader =
          await command.ExecuteReaderAsync();

      return await reader.ReadAsync();
    }
  }
}
