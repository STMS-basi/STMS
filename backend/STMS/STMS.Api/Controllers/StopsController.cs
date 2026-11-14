
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using STMS.Api.DTOs.Stops;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/stops")]
  public class StopsController : ControllerBase
  {
    private readonly AppDbContext _context;

    public StopsController(AppDbContext context)
    {
      _context = context;
    }

    // GET /api/stops/route/{routeId}
    // Public: Get stops for an active route
    [HttpGet("route/{routeId:int}")]
    public async Task<IActionResult> GetStopsByRoute(int routeId)
    {
      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == routeId);

      if (route == null || !route.IsActive)
      {
        return NotFound(new
        {
          message = "Route not found or inactive."
        });
      }

      var stops = await _context.Stops
          .AsNoTracking()
          .Where(s => s.RouteId == routeId)
          .OrderBy(s => s.StopOrder)
          .Select(s => new
          {
            s.StopId,
            s.RouteId,
            s.Name,
            s.StopOrder,
            s.PickupTime,
            s.DropoffTime
          })
          .ToListAsync();

      return Ok(stops);
    }

    // GET /api/stops/{id}
    // Public: Get stop details
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetStopById(int id)
    {
      var stop = await _context.Stops
          .AsNoTracking()
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (stop == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      // Check route status separately
      // to avoid Oracle Boolean translation issues
      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == stop.RouteId);

      if (route == null || !route.IsActive)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      return Ok(new
      {
        stop.StopId,
        stop.RouteId,
        stop.Name,
        stop.StopOrder,
        stop.PickupTime,
        stop.DropoffTime
      });
    }

    // POST /api/stops/admin
    // Admin: Create a new stop
    [HttpPost("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateStop(
        [FromBody] CreateStopRequest request)
    {
      if (string.IsNullOrWhiteSpace(request.Name))
      {
        return BadRequest(new
        {
          message = "Stop name is required."
        });
      }

      if (request.RouteId <= 0 || request.StopOrder <= 0)
      {
        return BadRequest(new
        {
          message = "Route ID and stop order must be greater than zero."
        });
      }

      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == request.RouteId);

      if (route == null || !route.IsActive)
      {
        return BadRequest(new
        {
          message = "Route not found or inactive."
        });
      }

      // Prevent duplicate stop order in the same route
      var duplicateOrder = await _context.Stops
          .AnyAsync(s =>
              s.RouteId == request.RouteId &&
              s.StopOrder == request.StopOrder);

      if (duplicateOrder)
      {
        return Conflict(new
        {
          message = "Stop order already exists for this route."
        });
      }

      var stop = new STMS.Core.Entities.Stop
      {
        RouteId = request.RouteId,
        Name = request.Name.Trim(),
        StopOrder = request.StopOrder,
        PickupTime = request.PickupTime,
        DropoffTime = request.DropoffTime
      };

      _context.Stops.Add(stop);
      await _context.SaveChangesAsync();

      return StatusCode(201, new
      {
        message = "Stop created successfully.",
        stopId = stop.StopId,
        routeId = stop.RouteId,
        stopOrder = stop.StopOrder
      });
    }

    // PUT /api/stops/admin/{id}
    // Admin: Update an existing stop
    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateStop(
        int id,
        [FromBody] UpdateStopRequest request)
    {
      var stop = await _context.Stops
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (stop == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      if (string.IsNullOrWhiteSpace(request.Name))
      {
        return BadRequest(new
        {
          message = "Stop name is required."
        });
      }

      if (request.RouteId <= 0 || request.StopOrder <= 0)
      {
        return BadRequest(new
        {
          message = "Route ID and stop order must be greater than zero."
        });
      }

      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r => r.RouteId == request.RouteId);

      if (route == null || !route.IsActive)
      {
        return BadRequest(new
        {
          message = "Route not found or inactive."
        });
      }

      // Prevent duplicate stop order
      var duplicateOrder = await _context.Stops
          .AnyAsync(s =>
              s.RouteId == request.RouteId &&
              s.StopOrder == request.StopOrder &&
              s.StopId != id);

      if (duplicateOrder)
      {
        return Conflict(new
        {
          message = "Stop order already exists for this route."
        });
      }

      // Prevent moving a stop linked to subscriptions
      // to another route
      if (stop.RouteId != request.RouteId)
      {
        var hasSubscriptions = await _context.Subscriptions
            .AnyAsync(s => s.StopId == id);

        if (hasSubscriptions)
        {
          return Conflict(new
          {
            message = "Cannot move a stop to another route because it has subscriptions."
          });
        }
      }

      stop.RouteId = request.RouteId;
      stop.Name = request.Name.Trim();
      stop.StopOrder = request.StopOrder;
      stop.PickupTime = request.PickupTime;
      stop.DropoffTime = request.DropoffTime;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Stop updated successfully.",
        stopId = stop.StopId,
        routeId = stop.RouteId,
        stopOrder = stop.StopOrder
      });
    }

    // DELETE /api/stops/admin/{id}
    // Admin: Delete a stop if it has no subscriptions
    [HttpDelete("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteStop(int id)
    {
      var stop = await _context.Stops
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (stop == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      // Prevent deleting a stop linked to subscriptions
      var hasSubscriptions = await _context.Subscriptions
          .AnyAsync(s => s.StopId == id);

      if (hasSubscriptions)
      {
        return Conflict(new
        {
          message = "Cannot delete a stop linked to subscriptions."
        });
      }

      _context.Stops.Remove(stop);

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Stop deleted successfully.",
        stopId = id
      });
    }
  }
}
