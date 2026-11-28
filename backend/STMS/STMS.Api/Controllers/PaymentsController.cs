
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using STMS.Core.Entities;
using STMS.Infrastructure.Data;
using System.Security.Claims;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/payments")]
  [Authorize]
  public class PaymentsController : ControllerBase
  {
    private readonly AppDbContext _context;

    public PaymentsController(AppDbContext context)
    {
      _context = context;
    }

    // ============================================
    // PARENT: GET MY PAYMENTS
    // ============================================

    [HttpGet("my")]
    [Authorize(Roles = "Parent")]
    public async Task<IActionResult> GetMyPayments()
    {
      var parentId = await GetParentIdAsync();

      if (parentId == null)
        return Unauthorized(new
        {
          message = "Parent account not found or token is invalid."
        });

      var payments = await _context.Payments
          .AsNoTracking()
          .Where(p =>
              p.Subscription.Student.ParentId == parentId.Value)
          .OrderByDescending(p => p.PaymentId)
          .Select(p => new
          {
            p.PaymentId,
            p.SubscriptionId,
            p.Subscription.ReferenceNumber,
            studentName = p.Subscription.Student.FullName,

            startDate = p.Subscription.StartDate,
            endDate = p.Subscription.EndDate,

            p.AmountDue,
            p.AmountPaid,
            remainingAmount = p.AmountDue - p.AmountPaid,
            p.Status,
            p.PaymentDate,
            p.Notes
          })
          .ToListAsync();

      return Ok(payments);
    }

    // ============================================
    // ADMIN: GET ALL PAYMENTS
    // ============================================

    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllPayments()
    {
      var payments = await _context.Payments
          .AsNoTracking()
          .OrderByDescending(p => p.PaymentId)
          .Select(p => new
          {
            p.PaymentId,
            p.SubscriptionId,
            p.Subscription.ReferenceNumber,
            studentName = p.Subscription.Student.FullName,

            startDate = p.Subscription.StartDate,
            endDate = p.Subscription.EndDate,

            p.AmountDue,
            p.AmountPaid,
            remainingAmount = p.AmountDue - p.AmountPaid,
            p.Status,
            p.PaymentDate,
            p.RecordedBy,
            p.Notes
          })
          .ToListAsync();

      return Ok(payments);
    }

    // ============================================
    // ADMIN: CONFIRM FULL PAYMENT
    // ============================================

    [HttpPost("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> RecordPayment(
        [FromBody] RecordPaymentRequest request)
    {
      if (request.SubscriptionId <= 0 || request.Amount <= 0)
        return BadRequest(new
        {
          message = "Valid subscription ID and positive amount are required."
        });

      var userIdValue =
          User.FindFirstValue(ClaimTypes.NameIdentifier);

      if (!int.TryParse(userIdValue, out var adminUserId))
        return Unauthorized(new
        {
          message = "Invalid admin token."
        });

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      try
      {
        // Lock subscription to prevent concurrent payments.
        var connection = _context.Database.GetDbConnection();
        var dbTransaction = transaction.GetDbTransaction();

        await using (var command = connection.CreateCommand())
        {
          command.Transaction = dbTransaction;

          command.CommandText =
              "SELECT SUBSCRIPTIONID FROM SUBSCRIPTIONS " +
              "WHERE SUBSCRIPTIONID = :id FOR UPDATE";

          command.CommandTimeout = 30;

          var parameter = command.CreateParameter();
          parameter.ParameterName = "id";
          parameter.Value = request.SubscriptionId;

          command.Parameters.Add(parameter);

          await using var reader =
              await command.ExecuteReaderAsync();

          if (!await reader.ReadAsync())
            return NotFound(new
            {
              message = "Subscription not found."
            });
        }

        // Read after acquiring the lock.
        // Keep tracked so status can be updated.
        var subscription = await _context.Subscriptions
            .FirstOrDefaultAsync(s =>
                s.SubscriptionId == request.SubscriptionId);

        if (subscription == null)
          return NotFound(new
          {
            message = "Subscription not found."
          });

        // Admin must accept the request first.
        if (subscription.Status != "AwaitingPayment")
          return Conflict(new
          {
            message = "Only subscriptions awaiting payment can receive payment confirmation."
          });

        // Full payment only. No installments.
        if (request.Amount != subscription.Fee)
          return BadRequest(new
          {
            message = "The full subscription fee must be paid in one payment. Installments are not allowed.",
            requiredAmount = subscription.Fee
          });

        // Check any existing payment record.
        var payment = await _context.Payments
            .FirstOrDefaultAsync(p =>
                p.SubscriptionId == request.SubscriptionId);

        // Protect old payment records.
        // Never overwrite a paid or partially paid record.
        if (payment != null &&
            (payment.AmountPaid != 0m ||
             payment.Status == "Paid" ||
             payment.Status == "Partial"))
        {
          return Conflict(new
          {
            message = "This subscription already has a recorded payment. Existing payment records cannot be overwritten."
          });
        }

        // Create a payment summary if none exists.
        if (payment == null)
        {
          payment = new Payment
          {
            SubscriptionId = subscription.SubscriptionId,
            AmountDue = subscription.Fee,
            AmountPaid = 0m,
            Status = "Unpaid"
          };

          _context.Payments.Add(payment);
        }
        else
        {
          // An existing unpaid record must match the fee.
          if (payment.AmountDue != subscription.Fee)
            return Conflict(new
            {
              message = "Existing payment amount does not match the subscription fee."
            });
        }

        // Confirm the full payment.
        payment.AmountDue = subscription.Fee;
        payment.AmountPaid = subscription.Fee;
        payment.Status = "Paid";
        payment.PaymentDate = DateTime.UtcNow;
        payment.RecordedBy = adminUserId;
        payment.Notes = request.Notes;

        // Activate subscription only after full payment.
        subscription.Status = "Approved";

        // Save both changes in one transaction.
        await _context.SaveChangesAsync();

        await transaction.CommitAsync();

        return Ok(new
        {
          message = "Full payment confirmed and subscription approved successfully.",
          paymentId = payment.PaymentId,
          subscriptionId = subscription.SubscriptionId,
          amountDue = payment.AmountDue,
          amountPaid = payment.AmountPaid,
          remainingAmount =
                payment.AmountDue - payment.AmountPaid,
          paymentStatus = payment.Status,
          subscriptionStatus = subscription.Status
        });
      }
      catch
      {
        await transaction.RollbackAsync();
        throw;
      }
    }

    // ============================================
    // HELPER: GET LOGGED-IN PARENT ID
    // ============================================

    private async Task<int?> GetParentIdAsync()
    {
      var userIdValue =
          User.FindFirstValue(ClaimTypes.NameIdentifier);

      if (!int.TryParse(userIdValue, out var userId))
        return null;

      var parent = await _context.Parents
          .AsNoTracking()
          .FirstOrDefaultAsync(p =>
              p.UserId == userId);

      return parent?.ParentId;
    }
  }

  // ============================================
  // REQUEST DTO
  // ============================================

  public class RecordPaymentRequest
  {
    public int SubscriptionId { get; set; }

    public decimal Amount { get; set; }

    public string? Notes { get; set; }
  }
}
