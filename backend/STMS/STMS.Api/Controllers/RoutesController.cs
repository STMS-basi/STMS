
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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
    // Public: Get active routes
    [HttpGet]
    public async Task<IActionResult> GetRoutes(
        [FromQuery] string? search,
        [FromQuery] string? area)
    {
      var routesQuery = _context.Routes.AsNoTracking();

      if (!string.IsNullOrWhiteSpace(search))
      {
        var keyword = search.Trim().ToLower();

        routesQuery = routesQuery.Where(r =>
            r.Name.ToLower().Contains(keyword) ||
            r.RouteNumber.ToLower().Contains(keyword) ||
            r.StartPoint.ToLower().Contains(keyword) ||
            r.Destination.ToLower().Contains(keyword));
      }

      if (!string.IsNullOrWhiteSpace(area))
      {
        var selectedArea = area.Trim().ToLower();

        routesQuery = routesQuery.Where(r =>
            r.ServiceArea.ToLower() == selectedArea);
      }

      var routesFromDatabase = await routesQuery.ToListAsync();

      var activeRoutes = routesFromDatabase
          .Where(r => r.IsActive)
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
            r.DriverId
          })
          .ToList();

      return Ok(activeRoutes);
    }

    // GET /api/routes/areas
    // Public: Get active route areas
    [HttpGet("areas")]
    public async Task<IActionResult> GetAreas()
    {
      var routes = await _context.Routes
          .AsNoTracking()
          .ToListAsync();

      var areas = routes
          .Where(r => r.IsActive)
          .Select(r => r.ServiceArea)
          .Where(area => !string.IsNullOrWhiteSpace(area))
          .Distinct(StringComparer.OrdinalIgnoreCase)
          .OrderBy(area => area)
          .ToList();

      return Ok(areas);
    }

    // GET /api/routes/{id}
    // Public: Get active route details
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetRouteById(int id)
    {
      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null || !route.IsActive)
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
        Stops = stops
      });
    }

    // GET /api/routes/admin
    // Admin: Get all routes (active and inactive)
    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllRoutesForAdmin()
    {
      var routes = await _context.Routes
          .AsNoTracking()
          .OrderBy(r => r.RouteNumber)
          .ToListAsync();

      var result = routes.Select(r => new
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
      });

      return Ok(result);
    }

    // POST /api/routes/admin
    // Admin: Create a new route
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

      var exists = await _context.Routes
          .AnyAsync(r => r.RouteNumber == routeNumber);

      if (exists)
      {
        return Conflict(new
        {
          message = "Route number already exists."
        });
      }

      // Validate assigned bus and its capacity
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
            message = "Bus capacity cannot be smaller than route capacity."
          });
        }
      }

      if (request.DriverId.HasValue)
      {
        var driverExists = await _context.Drivers
            .AnyAsync(d =>
                d.DriverId == request.DriverId.Value &&
                d.IsActive);

        if (!driverExists)
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
        IsActive = true
      };

      _context.Routes.Add(route);
      await _context.SaveChangesAsync();

      return StatusCode(201, new
      {
        message = "Route created successfully.",
        routeId = route.RouteId,
        routeNumber = route.RouteNumber
      });
    }

    // PUT /api/routes/admin/{id}
    // Admin: Update route details
    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateRoute(
        int id,
        [FromBody] UpdateRouteRequest request)
    {
      var route = await _context.Routes
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

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

      // Validate assigned bus and its capacity
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
            message = "Bus capacity cannot be smaller than route capacity."
          });
        }
      }

      if (request.DriverId.HasValue)
      {
        var driverExists = await _context.Drivers
            .AnyAsync(d =>
                d.DriverId == request.DriverId.Value &&
                d.IsActive);

        if (!driverExists)
        {
          return BadRequest(new
          {
            message = "Driver not found or inactive."
          });
        }
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

      return Ok(new
      {
        message = "Route updated successfully.",
        routeId = route.RouteId,
        routeNumber = route.RouteNumber
      });
    }

    // PATCH /api/routes/admin/{id}/deactivate
    // Admin: Deactivate a route
    [HttpPatch("admin/{id:int}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeactivateRoute(int id)
    {
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

      var hasActiveSubscriptions = await _context.Subscriptions
          .AnyAsync(s =>
              s.RouteId == id &&
              (s.Status == "Pending" ||
               s.Status == "Approved"));

      if (hasActiveSubscriptions)
      {
        return Conflict(new
        {
          message = "Cannot deactivate a route with pending or approved subscriptions."
        });
      }

      route.IsActive = false;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Route deactivated successfully.",
        routeId = route.RouteId,
        isActive = route.IsActive
      });
    }

    // PATCH /api/routes/admin/{id}/activate
    // Admin: Reactivate an inactive route
    [HttpPatch("admin/{id:int}/activate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ActivateRoute(int id)
    {
      var route = await _context.Routes
          .FirstOrDefaultAsync(r => r.RouteId == id);

      if (route == null)
      {
        return NotFound(new
        {
          message = "Route not found."
        });
      }

      if (route.IsActive)
      {
        return Conflict(new
        {
          message = "Route is already active."
        });
      }

      // Validate assigned bus and its capacity
      if (route.BusId.HasValue)
      {
        var assignedBus = await _context.Buses
            .AsNoTracking()
            .FirstOrDefaultAsync(b =>
                b.BusId == route.BusId.Value);

        if (assignedBus == null || !assignedBus.IsActive)
        {
          return BadRequest(new
          {
            message = "Cannot activate route because its assigned bus is inactive or missing."
          });
        }

        if (assignedBus.Capacity < route.Capacity)
        {
          return BadRequest(new
          {
            message = "Cannot activate route because its assigned bus capacity is insufficient."
          });
        }
      }

      if (route.DriverId.HasValue)
      {
        var driverExists = await _context.Drivers
            .AnyAsync(d =>
                d.DriverId == route.DriverId.Value &&
                d.IsActive);

        if (!driverExists)
        {
          return BadRequest(new
          {
            message = "Cannot activate route because its assigned driver is inactive or missing."
          });
        }
      }

      route.IsActive = true;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Route activated successfully.",
        routeId = route.RouteId,
        isActive = route.IsActive
      });
    }
  }
}
