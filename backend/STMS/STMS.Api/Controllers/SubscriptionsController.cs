using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using STMS.Api.DTOs.Subscriptions;
using STMS.Core.Entities;
using STMS.Infrastructure.Data;
using System.Globalization;
using System.Security.Claims;
using System.Data.Common;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/subscriptions")]
  [Authorize]
  public class SubscriptionsController : ControllerBase
  {
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public SubscriptionsController(
        AppDbContext context,
        IConfiguration configuration)
    {
      _context = context;
      _configuration = configuration;
    }

    // ============================================
    // REGISTRATION INFORMATION
    // ============================================

    [HttpGet("registration-info")]
    [AllowAnonymous]
    public IActionResult GetRegistrationInfo()
    {
      var semester = GetRegistrationSemester();

      if (semester == null)
      {
        return Ok(new
        {
          registrationOpen = false,
          semesterName = (string?)null,
          startDate = (DateTime?)null,
          endDate = (DateTime?)null,
          message = "Registration is currently closed."
        });
      }

      var semesterName = _configuration
          .GetSection("SchoolSemesters:Semesters")
          .GetChildren()
          .FirstOrDefault(section =>
              DateTime.TryParseExact(
                  section["StartDate"],
                  "yyyy-MM-dd",
                  CultureInfo.InvariantCulture,
                  DateTimeStyles.None,
                  out var start)
              && start.Date == semester.Value.StartDate.Date)?
          ["Name"];

      return Ok(new
      {
        registrationOpen = true,
        semesterName,
        startDate = semester.Value.StartDate,
        endDate = semester.Value.EndDate,
        message = "Registration is open."
      });
    }

    // ============================================
    // PARENT: GET SUBSCRIPTIONS
    // ============================================

    [HttpGet]
    [Authorize(Roles = "Parent")]
    public async Task<IActionResult> GetMySubscriptions()
    {
      var parentId = await GetParentIdAsync();

      if (parentId == null)
        return Unauthorized(new
        {
          message = "Parent account not found or token is invalid."
        });

      var subscriptions = await _context.Subscriptions
          .AsNoTracking()
          .Where(s => s.Student.ParentId == parentId.Value)
          .OrderByDescending(s => s.RequestedAt)
          .Select(s => new
          {
            s.SubscriptionId,
            s.ReferenceNumber,
            s.StudentId,
            studentName = s.Student.FullName,
            s.RouteId,
            routeName = s.Route.Name,
            s.StopId,
            stopName = s.Stop.Name,
            s.TransportType,
            s.TripDirection,
            s.Fee,
            s.Status,
            s.StartDate,
            s.EndDate,
            s.RequestedAt
          })
          .ToListAsync();

      return Ok(subscriptions);
    }

    [HttpGet("{id:int}")]
    [Authorize(Roles = "Parent")]
    public async Task<IActionResult> GetSubscription(int id)
    {
      var parentId = await GetParentIdAsync();

      if (parentId == null)
        return Unauthorized(new
        {
          message = "Parent account not found or token is invalid."
        });

      var subscription = await _context.Subscriptions
          .AsNoTracking()
          .Where(s =>
              s.SubscriptionId == id &&
              s.Student.ParentId == parentId.Value)
          .Select(s => new
          {
            s.SubscriptionId,
            s.ReferenceNumber,
            s.StudentId,
            studentName = s.Student.FullName,
            s.RouteId,
            routeName = s.Route.Name,
            s.StopId,
            stopName = s.Stop.Name,
            s.TransportType,
            s.TripDirection,
            s.Fee,
            s.Status,
            s.StartDate,
            s.EndDate,
            s.RequestedAt
          })
          .FirstOrDefaultAsync();

      if (subscription == null)
        return NotFound(new
        {
          message = "Subscription not found."
        });

      return Ok(subscription);
    }

    // ============================================
    // PARENT: CREATE SUBSCRIPTION
    // ============================================

    [HttpPost]
    [Authorize(Roles = "Parent")]
    public async Task<IActionResult> CreateSubscription(
        [FromBody] CreateSubscriptionRequest request)
    {
      var parentId = await GetParentIdAsync();

      if (parentId == null)
        return Unauthorized(new
        {
          message = "Parent account not found or token is invalid."
        });

      if (request.StudentId <= 0 ||
          request.RouteId <= 0 ||
          request.StopId <= 0)
      {
        return BadRequest(new
        {
          message = "Valid student, route and stop IDs are required."
        });
      }

      if (request.TransportType != "OneWay" &&
          request.TransportType != "RoundTrip")
      {
        return BadRequest(new
        {
          message = "Transport type must be OneWay or RoundTrip."
        });
      }

      // Validate and normalize trip direction.
      if (!TryResolveTripDirection(
          request.TransportType,
          request.TripDirection,
          out var tripDirection))
      {
        return BadRequest(new
        {
          message = request.TransportType == "OneWay"
              ? "OneWay subscriptions require MorningPickup or AfternoonDropoff."
              : "RoundTrip subscriptions require Both as the trip direction."
        });
      }

      var semester = GetRegistrationSemester();

      if (semester == null)
        return BadRequest(new
        {
          message = "Registration is currently closed. No semester is available."
        });

      var semesterStart = semester.Value.StartDate;
      var semesterEnd = semester.Value.EndDate;

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Lock student first, then route.
      var lockResult = await LockStudentAndRouteAsync(
          request.StudentId,
          request.RouteId);

      if (!lockResult.StudentExists)
        return NotFound(new
        {
          message = "Student not found."
        });

      if (!lockResult.RouteExists)
        return BadRequest(new
        {
          message = "Selected route is not available."
        });

      // Verify student ownership after acquiring locks.
      var studentExists = await _context.Students
          .AsNoTracking()
          .AnyAsync(s =>
              s.StudentId == request.StudentId &&
              s.ParentId == parentId.Value);

      if (!studentExists)
        return NotFound(new
        {
          message = "Student not found."
        });

      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r =>
              r.RouteId == request.RouteId);

      if (route == null || !route.IsActive ||
          !route.BusId.HasValue || !route.DriverId.HasValue)
        return BadRequest(new
        {
          message = "Selected route is not available."
        });

      // Get the selected stop and its schedule.
      var stop = await _context.Stops
          .AsNoTracking()
          .FirstOrDefaultAsync(s =>
              s.StopId == request.StopId &&
              s.RouteId == request.RouteId);

      if (stop == null)
        return BadRequest(new
        {
          message = "Selected stop does not belong to the route."
        });

      // Validate the required stop schedule.
      var scheduleError = ValidateStopSchedule(
          stop,
          tripDirection);

      if (scheduleError != null)
      {
        return BadRequest(new
        {
          message = scheduleError
        });
      }

      // Pending, AwaitingPayment and Approved block
      // subscriptions whose dates overlap the selected semester.
      // This also protects against legacy date ranges.
      var hasExistingSubscription =
          await _context.Subscriptions
              .AsNoTracking()
              .AnyAsync(s =>
                  s.StudentId == request.StudentId &&
                  s.StartDate <= semesterEnd &&
                  s.EndDate >= semesterStart &&
                  (s.Status == "Pending" ||
                   s.Status == "AwaitingPayment" ||
                   s.Status == "Approved"));

      if (hasExistingSubscription)
        return Conflict(new
        {
          message = "Student already has a subscription for this semester."
        });

      // All active requests overlapping this semester reserve a seat.
      var reservedSeats = await _context.Subscriptions
          .AsNoTracking()
          .CountAsync(s =>
              s.RouteId == request.RouteId &&
              s.StartDate <= semesterEnd &&
              s.EndDate >= semesterStart &&
              (s.Status == "Pending" ||
               s.Status == "AwaitingPayment" ||
               s.Status == "Approved"));

      if (reservedSeats >= route.Capacity)
        return Conflict(new
        {
          message = "Selected route is full."
        });

      decimal fee = request.TransportType == "OneWay"
          ? 150m
          : 300m;

      var subscription = new Subscription
      {
        StudentId = request.StudentId,
        RouteId = request.RouteId,
        StopId = request.StopId,
        TransportType = request.TransportType,
        TripDirection = tripDirection,
        Fee = fee,
        Status = "Pending",
        StartDate = semesterStart,
        EndDate = semesterEnd,
        RequestedAt = DateTime.Now,
        ReferenceNumber = "SUB-" +
              Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()
      };

      _context.Subscriptions.Add(subscription);

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return StatusCode(201, new
      {
        message = "Subscription request created successfully.",
        subscriptionId = subscription.SubscriptionId,
        referenceNumber = subscription.ReferenceNumber,
        transportType = subscription.TransportType,
        tripDirection = subscription.TripDirection,
        fee = subscription.Fee,
        status = subscription.Status,
        startDate = subscription.StartDate,
        endDate = subscription.EndDate
      });
    }

    // ============================================
    // PARENT: RENEW SUBSCRIPTION
    // ============================================

    [HttpPost("{id:int}/renew")]
    [Authorize(Roles = "Parent")]
    public async Task<IActionResult> RenewSubscription(int id)
    {
      var parentId = await GetParentIdAsync();

      if (parentId == null)
        return Unauthorized(new
        {
          message = "Parent account not found or token is invalid."
        });

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      // Read old subscription to identify locks.
      var previousSubscription = await _context.Subscriptions
          .AsNoTracking()
          .FirstOrDefaultAsync(s =>
              s.SubscriptionId == id &&
              s.Student.ParentId == parentId.Value);

      if (previousSubscription == null)
        return NotFound(new
        {
          message = "Subscription not found."
        });

      var lockResult = await LockStudentAndRouteAsync(
          previousSubscription.StudentId,
          previousSubscription.RouteId);

      if (!lockResult.StudentExists)
        return NotFound(new
        {
          message = "Student not found."
        });

      if (!lockResult.RouteExists)
        return BadRequest(new
        {
          message = "Previous route is no longer available. Please create a new subscription."
        });

      // Refresh subscription after acquiring locks.
      previousSubscription = await _context.Subscriptions
          .AsNoTracking()
          .FirstOrDefaultAsync(s =>
              s.SubscriptionId == id &&
              s.Student.ParentId == parentId.Value);

      if (previousSubscription == null)
        return NotFound(new
        {
          message = "Subscription not found."
        });

      if (previousSubscription.Status != "Approved")
        return Conflict(new
        {
          message = "Only approved subscriptions can be renewed. Please create a new subscription."
        });

      var semester = GetRegistrationSemester();

      if (semester == null)
        return BadRequest(new
        {
          message = "Registration is currently closed."
        });

      var semesterStart = semester.Value.StartDate;
      var semesterEnd = semester.Value.EndDate;

      if (semesterStart <= previousSubscription.StartDate)
        return Conflict(new
        {
          message = "Renewal is only available for a later semester."
        });

      var alreadySubscribed = await _context.Subscriptions
          .AsNoTracking()
          .AnyAsync(s =>
              s.StudentId == previousSubscription.StudentId &&
              s.StartDate <= semesterEnd &&
              s.EndDate >= semesterStart &&
              (s.Status == "Pending" ||
               s.Status == "AwaitingPayment" ||
               s.Status == "Approved"));

      if (alreadySubscribed)
        return Conflict(new
        {
          message = "Student already has a subscription for this semester."
        });

      var route = await _context.Routes
          .AsNoTracking()
          .FirstOrDefaultAsync(r =>
              r.RouteId == previousSubscription.RouteId);

      if (route == null || !route.IsActive ||
          !route.BusId.HasValue || !route.DriverId.HasValue)
        return BadRequest(new
        {
          message = "Previous route is no longer available. Please create a new subscription."
        });

      // Get the previous stop and its current schedule.
      var stop = await _context.Stops
          .AsNoTracking()
          .FirstOrDefaultAsync(s =>
              s.StopId == previousSubscription.StopId &&
              s.RouteId == previousSubscription.RouteId);

      if (stop == null)
        return BadRequest(new
        {
          message = "Previous stop is no longer available. Please create a new subscription."
        });

      var reservedSeats = await _context.Subscriptions
          .AsNoTracking()
          .CountAsync(s =>
              s.RouteId == previousSubscription.RouteId &&
              s.StartDate <= semesterEnd &&
              s.EndDate >= semesterStart &&
              (s.Status == "Pending" ||
               s.Status == "AwaitingPayment" ||
               s.Status == "Approved"));

      if (reservedSeats >= route.Capacity)
        return Conflict(new
        {
          message = "Selected route is full for the new semester."
        });

      if (previousSubscription.TransportType != "OneWay" &&
          previousSubscription.TransportType != "RoundTrip")
        return BadRequest(new
        {
          message = "Previous transport type is invalid. Please create a new subscription."
        });

      // Preserve the trip direction during renewal.
      // Do not guess the direction of legacy OneWay subscriptions.
      if (!TryResolveTripDirection(
          previousSubscription.TransportType,
          previousSubscription.TripDirection,
          out var tripDirection))
      {
        return BadRequest(new
        {
          message = "Previous trip direction is missing or invalid. Please create a new subscription and select the correct trip direction."
        });
      }

      // Ensure the previous stop supports the required direction.
      var scheduleError = ValidateStopSchedule(
          stop,
          tripDirection);

      if (scheduleError != null)
      {
        return BadRequest(new
        {
          message = scheduleError +
              " Please create a new subscription with an available stop."
        });
      }

      decimal fee =
          previousSubscription.TransportType == "OneWay"
              ? 150m
              : 300m;

      var newSubscription = new Subscription
      {
        StudentId = previousSubscription.StudentId,
        RouteId = previousSubscription.RouteId,
        StopId = previousSubscription.StopId,
        TransportType = previousSubscription.TransportType,
        TripDirection = tripDirection,
        Fee = fee,
        Status = "Pending",
        StartDate = semesterStart,
        EndDate = semesterEnd,
        RequestedAt = DateTime.Now,
        ReferenceNumber = "SUB-" +
              Guid.NewGuid().ToString("N")[..12].ToUpperInvariant()
      };

      _context.Subscriptions.Add(newSubscription);

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return StatusCode(201, new
      {
        message = "Subscription renewal request created successfully.",
        previousSubscriptionId = previousSubscription.SubscriptionId,
        subscriptionId = newSubscription.SubscriptionId,
        referenceNumber = newSubscription.ReferenceNumber,
        studentId = newSubscription.StudentId,
        routeId = newSubscription.RouteId,
        stopId = newSubscription.StopId,
        transportType = newSubscription.TransportType,
        tripDirection = newSubscription.TripDirection,
        fee = newSubscription.Fee,
        status = newSubscription.Status,
        startDate = newSubscription.StartDate,
        endDate = newSubscription.EndDate
      });
    }

    // ============================================
    // ADMIN ENDPOINTS
    // ============================================

    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllSubscriptions()
    {
      var subscriptions = await _context.Subscriptions
          .AsNoTracking()
          .OrderByDescending(s => s.RequestedAt)
          .Select(s => new
          {
            s.SubscriptionId,
            s.ReferenceNumber,
            s.StudentId,
            studentName = s.Student.FullName,
            s.RouteId,
            routeName = s.Route.Name,
            s.StopId,
            stopName = s.Stop.Name,
            s.TransportType,
            s.TripDirection,
            s.Fee,
            s.Status,
            s.StartDate,
            s.EndDate,
            s.RequestedAt
          })
          .ToListAsync();

      return Ok(subscriptions);
    }

    // ============================================
    // ADMIN: PRELIMINARY APPROVAL
    // CONCURRENCY-SAFE
    // ============================================

    [HttpPatch("admin/{id:int}/approve")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ApproveSubscription(int id)
    {
      if (id <= 0)
        return BadRequest(new
        {
          message = "Valid subscription ID is required."
        });

      // Atomic conditional update:
      // Only a Pending subscription can be accepted.
      var affectedRows = await _context.Subscriptions
          .Where(s =>
              s.SubscriptionId == id &&
              s.Status == "Pending")
          .ExecuteUpdateAsync(setters => setters
              .SetProperty(s => s.Status, "AwaitingPayment"));

      if (affectedRows == 0)
      {
        var exists = await _context.Subscriptions
            .AsNoTracking()
            .AnyAsync(s => s.SubscriptionId == id);

        if (!exists)
          return NotFound(new
          {
            message = "Subscription not found."
          });

        return Conflict(new
        {
          message = "Only pending subscriptions can be approved."
        });
      }

      return Ok(new
      {
        message = "Subscription accepted. Awaiting full payment confirmation.",
        subscriptionId = id,
        status = "AwaitingPayment"
      });
    }

    // ============================================
    // ADMIN: REJECT SUBSCRIPTION
    // CONCURRENCY-SAFE
    // ============================================

    [HttpPatch("admin/{id:int}/reject")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> RejectSubscription(int id)
    {
      if (id <= 0)
        return BadRequest(new
        {
          message = "Valid subscription ID is required."
        });

      // Atomic conditional update:
      // Once accepted, a subscription cannot be rejected.
      var affectedRows = await _context.Subscriptions
          .Where(s =>
              s.SubscriptionId == id &&
              s.Status == "Pending")
          .ExecuteUpdateAsync(setters => setters
              .SetProperty(s => s.Status, "Rejected"));

      if (affectedRows == 0)
      {
        var exists = await _context.Subscriptions
            .AsNoTracking()
            .AnyAsync(s => s.SubscriptionId == id);

        if (!exists)
          return NotFound(new
          {
            message = "Subscription not found."
          });

        return Conflict(new
        {
          message = "Only pending subscriptions can be rejected."
        });
      }

      return Ok(new
      {
        message = "Subscription rejected successfully.",
        subscriptionId = id,
        status = "Rejected"
      });
    }

    // ============================================
    // HELPERS: TRIP DIRECTION
    // ============================================

    private static bool TryResolveTripDirection(
        string transportType,
        string? requestedDirection,
        out string tripDirection)
    {
      tripDirection = string.Empty;

      var direction = requestedDirection?.Trim();

      if (transportType == "OneWay")
      {
        if (string.Equals(
            direction,
            "MorningPickup",
            StringComparison.OrdinalIgnoreCase))
        {
          tripDirection = "MorningPickup";
          return true;
        }

        if (string.Equals(
            direction,
            "AfternoonDropoff",
            StringComparison.OrdinalIgnoreCase))
        {
          tripDirection = "AfternoonDropoff";
          return true;
        }

        return false;
      }

      if (transportType == "RoundTrip")
      {
        // RoundTrip always includes both directions.
        // A missing direction is accepted for compatibility.
        if (string.IsNullOrWhiteSpace(direction) ||
            string.Equals(
                direction,
                "Both",
                StringComparison.OrdinalIgnoreCase))
        {
          tripDirection = "Both";
          return true;
        }

        return false;
      }

      return false;
    }

    // ============================================
    // HELPERS: STOP SCHEDULE VALIDATION
    // ============================================

    private static string? ValidateStopSchedule(
        Stop stop,
        string tripDirection)
    {
      bool hasPickupTime =
          !string.IsNullOrWhiteSpace(stop.PickupTime);

      bool hasDropoffTime =
          !string.IsNullOrWhiteSpace(stop.DropoffTime);

      if (tripDirection == "MorningPickup")
      {
        if (!hasPickupTime)
        {
          return "Selected stop does not have a morning pickup time.";
        }

        return null;
      }

      if (tripDirection == "AfternoonDropoff")
      {
        if (!hasDropoffTime)
        {
          return "Selected stop does not have an afternoon dropoff time.";
        }

        return null;
      }

      if (tripDirection == "Both")
      {
        if (!hasPickupTime || !hasDropoffTime)
        {
          return "RoundTrip requires both pickup and dropoff times at the selected stop.";
        }

        return null;
      }

      return "Invalid trip direction.";
    }

    // ============================================
    // HELPERS: CONCURRENCY PROTECTION
    // ============================================

    // Requires an active EF Core transaction.
    // Lock order: Student first, Route second.
    private async Task<(bool StudentExists, bool RouteExists)>
        LockStudentAndRouteAsync(
            int studentId,
            int routeId)
    {
      var currentTransaction =
          _context.Database.CurrentTransaction
          ?? throw new InvalidOperationException(
              "An active transaction is required.");

      var connection = _context.Database.GetDbConnection();
      var dbTransaction = currentTransaction.GetDbTransaction();

      var studentExists = await LockRowAsync(
          connection,
          dbTransaction,
          "SELECT STUDENTID FROM STUDENTS WHERE STUDENTID = :id FOR UPDATE",
          studentId);

      if (!studentExists)
        return (false, false);

      var routeExists = await LockRowAsync(
          connection,
          dbTransaction,
          "SELECT ROUTEID FROM ROUTES WHERE ROUTEID = :id FOR UPDATE",
          routeId);

      return (true, routeExists);
    }

    private static async Task<bool> LockRowAsync(
        DbConnection connection,
        DbTransaction transaction,
        string sql,
        int id)
    {
      await using var command = connection.CreateCommand();

      command.Transaction = transaction;
      command.CommandText = sql;
      command.CommandTimeout = 30;

      var parameter = command.CreateParameter();
      parameter.ParameterName = "id";
      parameter.Value = id;
      command.Parameters.Add(parameter);

      await using var reader = await command.ExecuteReaderAsync();

      return await reader.ReadAsync();
    }

    // ============================================
    // HELPERS: SCHOOL SEMESTERS
    // ============================================

    private (DateTime StartDate, DateTime EndDate)?
        GetRegistrationSemester()
    {
      var registrationDays = _configuration.GetValue<int>(
          "SchoolSemesters:RegistrationOpenDaysBefore", 14);

      if (registrationDays < 0)
        registrationDays = 14;

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
        return null;

      return available
          .OrderByDescending(s => s.StartDate)
          .First();
    }

    // ============================================
    // HELPERS: AUTHENTICATED PARENT
    // ============================================

    private async Task<int?> GetParentIdAsync()
    {
      var userIdValue =
          User.FindFirstValue(ClaimTypes.NameIdentifier);

      if (!int.TryParse(userIdValue, out var userId))
        return null;

      var parent = await _context.Parents
          .AsNoTracking()
          .FirstOrDefaultAsync(p => p.UserId == userId);

      return parent?.ParentId;
    }
  }
}