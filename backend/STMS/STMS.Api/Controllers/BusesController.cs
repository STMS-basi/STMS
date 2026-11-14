
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using STMS.Api.DTOs.Buses;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/buses")]
  public class BusesController : ControllerBase
  {
    private readonly AppDbContext _context;

    public BusesController(AppDbContext context)
    {
      _context = context;
    }

    // GET /api/buses/admin
    // Admin: Get all buses
    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllBuses()
    {
      var buses = await _context.Buses
          .AsNoTracking()
          .OrderBy(b => b.BusId)
          .Select(b => new
          {
            b.BusId,
            b.PlateNumber,
            b.Capacity,
            b.IsActive
          })
          .ToListAsync();

      return Ok(buses);
    }

    // GET /api/buses/admin/{id}
    // Admin: Get bus details
    [HttpGet("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetBusById(int id)
    {
      var bus = await _context.Buses
          .AsNoTracking()
          .FirstOrDefaultAsync(b => b.BusId == id);

      if (bus == null)
      {
        return NotFound(new
        {
          message = "Bus not found."
        });
      }

      return Ok(new
      {
        bus.BusId,
        bus.PlateNumber,
        bus.Capacity,
        bus.IsActive
      });
    }

    // POST /api/buses/admin
    // Admin: Create a new bus
    [HttpPost("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateBus(
        [FromBody] CreateBusRequest request)
    {
      if (string.IsNullOrWhiteSpace(request.PlateNumber))
      {
        return BadRequest(new
        {
          message = "Plate number is required."
        });
      }

      if (request.Capacity <= 0)
      {
        return BadRequest(new
        {
          message = "Capacity must be greater than zero."
        });
      }

      var plateNumber = request.PlateNumber.Trim();

      var duplicatePlate = await _context.Buses
          .AnyAsync(b => b.PlateNumber == plateNumber);

      if (duplicatePlate)
      {
        return Conflict(new
        {
          message = "A bus with this plate number already exists."
        });
      }

      var bus = new STMS.Core.Entities.Bus
      {
        PlateNumber = plateNumber,
        Capacity = request.Capacity,
        IsActive = true
      };

      _context.Buses.Add(bus);

      await _context.SaveChangesAsync();

      return StatusCode(201, new
      {
        message = "Bus created successfully.",
        busId = bus.BusId,
        plateNumber = bus.PlateNumber,
        capacity = bus.Capacity
      });
    }

    // PUT /api/buses/admin/{id}
    // Admin: Update bus details
    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateBus(
        int id,
        [FromBody] UpdateBusRequest request)
    {
      var bus = await _context.Buses
          .FirstOrDefaultAsync(b => b.BusId == id);

      if (bus == null)
      {
        return NotFound(new
        {
          message = "Bus not found."
        });
      }

      if (string.IsNullOrWhiteSpace(request.PlateNumber))
      {
        return BadRequest(new
        {
          message = "Plate number is required."
        });
      }

      if (request.Capacity <= 0)
      {
        return BadRequest(new
        {
          message = "Capacity must be greater than zero."
        });
      }

      var plateNumber = request.PlateNumber.Trim();

      var duplicatePlate = await _context.Buses
          .AnyAsync(b =>
              b.PlateNumber == plateNumber &&
              b.BusId != id);

      if (duplicatePlate)
      {
        return Conflict(new
        {
          message = "A bus with this plate number already exists."
        });
      }

      // Check capacities of active routes using this bus
      var assignedRoutes = await _context.Routes
          .AsNoTracking()
          .Where(r => r.BusId == id)
          .Select(r => new
          {
            r.RouteId,
            r.Capacity,
            r.IsActive
          })
          .ToListAsync();

      var capacityConflict = assignedRoutes.Any(r =>
          r.IsActive && r.Capacity > request.Capacity);

      if (capacityConflict)
      {
        return Conflict(new
        {
          message = "Bus capacity cannot be smaller than the capacity of an assigned active route."
        });
      }

      bus.PlateNumber = plateNumber;
      bus.Capacity = request.Capacity;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Bus updated successfully.",
        busId = bus.BusId,
        plateNumber = bus.PlateNumber,
        capacity = bus.Capacity
      });
    }

    // PATCH /api/buses/admin/{id}/deactivate
    // Admin: Deactivate a bus
    [HttpPatch("admin/{id:int}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeactivateBus(int id)
    {
      var bus = await _context.Buses
          .FirstOrDefaultAsync(b => b.BusId == id);

      if (bus == null)
      {
        return NotFound(new
        {
          message = "Bus not found."
        });
      }

      if (!bus.IsActive)
      {
        return BadRequest(new
        {
          message = "Bus is already inactive."
        });
      }

      // Load assigned routes and check status in C#
      // to avoid Oracle Boolean translation issues
      var assignedRoutes = await _context.Routes
          .AsNoTracking()
          .Where(r => r.BusId == id)
          .Select(r => new
          {
            r.RouteId,
            r.IsActive
          })
          .ToListAsync();

      if (assignedRoutes.Any(r => r.IsActive))
      {
        return Conflict(new
        {
          message = "Cannot deactivate a bus assigned to an active route."
        });
      }

      bus.IsActive = false;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Bus deactivated successfully.",
        busId = bus.BusId
      });
    }

    // PATCH /api/buses/admin/{id}/activate
    // Admin: Activate a bus
    [HttpPatch("admin/{id:int}/activate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ActivateBus(int id)
    {
      var bus = await _context.Buses
          .FirstOrDefaultAsync(b => b.BusId == id);

      if (bus == null)
      {
        return NotFound(new
        {
          message = "Bus not found."
        });
      }

      if (bus.IsActive)
      {
        return BadRequest(new
        {
          message = "Bus is already active."
        });
      }

      bus.IsActive = true;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Bus activated successfully.",
        busId = bus.BusId
      });
    }
  }
}
