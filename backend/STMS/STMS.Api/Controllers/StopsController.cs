
using System;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
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
    // Public: Get details of a stop on an active route
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
    // Admin: Create a stop
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

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock the route to serialize stop operations.
      if (!await LockRouteAsync(request.RouteId))
      {
        return BadRequest(new
        {
          message = "Route not found or inactive."
        });
      }

      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r =>
              r.RouteId == request.RouteId);

      if (route == null || !route.IsActive)
      {
        return BadRequest(new
        {
          message = "Route not found or inactive."
        });
      }

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

      try
      {
        await _context.SaveChangesAsync();
      }
      catch (DbUpdateException ex)
          when (ContainsOracleError(ex, "ORA-00001"))
      {
        return Conflict(new
        {
          message = "Stop order already exists for this route."
        });
      }

      await transaction.CommitAsync();

      return StatusCode(201, new
      {
        message = "Stop created successfully.",
        stopId = stop.StopId,
        routeId = stop.RouteId,
        stopOrder = stop.StopOrder
      });
    }

    // PUT /api/stops/admin/{id}
    // Admin: Update stop with subscription protection
    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateStop(
        int id,
        [FromBody] UpdateStopRequest request)
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

      var snapshot = await _context.Stops
          .AsNoTracking()
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (snapshot == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock involved routes in a consistent order.
      var routeIds = new[]
      {
                snapshot.RouteId,
                request.RouteId
            }
      .Distinct()
      .OrderBy(routeId => routeId)
      .ToList();

      foreach (var routeId in routeIds)
      {
        if (!await LockRouteAsync(routeId))
        {
          return BadRequest(new
          {
            message = "Route not found or inactive."
          });
        }
      }

      if (!await LockStopAsync(id))
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      var stop = await _context.Stops
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (stop == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      // Detect a route change made by another request.
      if (stop.RouteId != snapshot.RouteId)
      {
        return Conflict(new
        {
          message = "Stop was modified concurrently. Please retry."
        });
      }

      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r =>
              r.RouteId == request.RouteId);

      if (route == null || !route.IsActive)
      {
        return BadRequest(new
        {
          message = "Route not found or inactive."
        });
      }

      // Existing rule:
      // A stop with any subscriptions cannot move
      // to another route, including historical ones.
      if (stop.RouteId != request.RouteId)
      {
        var hasSubscriptions =
            await HasAnySubscriptionsAsync(id);

        if (hasSubscriptions)
        {
          return Conflict(new
          {
            message = "Cannot move a stop to another route because it has subscriptions."
          });
        }
      }

      var name = request.Name.Trim();

      // Protect stop details for current/future
      // subscriptions in protected statuses.
      var protectedFieldsChanged =
          !string.Equals(
              stop.Name,
              name,
              StringComparison.Ordinal) ||
          stop.StopOrder != request.StopOrder ||
          !Equals(
              stop.PickupTime,
              request.PickupTime) ||
          !Equals(
              stop.DropoffTime,
              request.DropoffTime);

      if (protectedFieldsChanged &&
          await HasProtectedSubscriptionsAsync(id))
      {
        return Conflict(new
        {
          message = "Cannot change stop details while protected subscriptions exist."
        });
      }

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

      stop.RouteId = request.RouteId;
      stop.Name = name;
      stop.StopOrder = request.StopOrder;
      stop.PickupTime = request.PickupTime;
      stop.DropoffTime = request.DropoffTime;

      try
      {
        await _context.SaveChangesAsync();
      }
      catch (DbUpdateException ex)
          when (ContainsOracleError(ex, "ORA-00001"))
      {
        return Conflict(new
        {
          message = "Stop order already exists for this route."
        });
      }

      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Stop updated successfully.",
        stopId = stop.StopId,
        routeId = stop.RouteId,
        stopOrder = stop.StopOrder
      });
    }

    // DELETE /api/stops/admin/{id}
    // Admin: Delete only if no subscriptions exist
    [HttpDelete("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeleteStop(int id)
    {
      var snapshot = await _context.Stops
          .AsNoTracking()
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (snapshot == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      if (!await LockRouteAsync(snapshot.RouteId))
      {
        return Conflict(new
        {
          message = "Stop route is no longer available."
        });
      }

      if (!await LockStopAsync(id))
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      var stop = await _context.Stops
          .FirstOrDefaultAsync(s => s.StopId == id);

      if (stop == null)
      {
        return NotFound(new
        {
          message = "Stop not found."
        });
      }

      if (stop.RouteId != snapshot.RouteId)
      {
        return Conflict(new
        {
          message = "Stop was modified concurrently. Please retry."
        });
      }

      if (await HasAnySubscriptionsAsync(id))
      {
        return Conflict(new
        {
          message = "Cannot delete a stop linked to subscriptions."
        });
      }

      _context.Stops.Remove(stop);

      try
      {
        await _context.SaveChangesAsync();
      }
      catch (DbUpdateException ex)
          when (ContainsOracleError(ex, "ORA-02292"))
      {
        return Conflict(new
        {
          message = "Cannot delete a stop linked to existing records."
        });
      }

      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Stop deleted successfully.",
        stopId = id
      });
    }

    // ========================================
    // HELPERS
    // ========================================

    private async Task<bool> HasAnySubscriptionsAsync(
        int stopId)
    {
      return await _context.Subscriptions
          .AsNoTracking()
          .AnyAsync(s => s.StopId == stopId);
    }

    private async Task<bool> HasProtectedSubscriptionsAsync(
        int stopId)
    {
      var today = DateTime.Today;

      return await _context.Subscriptions
          .AsNoTracking()
          .AnyAsync(s =>
              s.StopId == stopId &&
              s.EndDate >= today &&
              (s.Status == "Pending" ||
               s.Status == "AwaitingPayment" ||
               s.Status == "Approved"));
    }

    private async Task<bool> LockRouteAsync(int routeId)
    {
      return await LockRowAsync(
          "ROUTES", "ROUTEID", routeId);
    }

    private async Task<bool> LockStopAsync(int stopId)
    {
      return await LockRowAsync(
          "STOPS", "STOPID", stopId);
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

    private static bool ContainsOracleError(
        Exception exception,
        string errorCode)
    {
      Exception? current = exception;

      while (current != null)
      {
        if (current.Message.Contains(
            errorCode,
            StringComparison.OrdinalIgnoreCase))
        {
          return true;
        }

        current = current.InnerException;
      }

      return false;
    }
  }
}
