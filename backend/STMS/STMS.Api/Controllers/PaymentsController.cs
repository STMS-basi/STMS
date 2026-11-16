
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
    // PARENT ENDPOINTS
    // ============================================

    // GET: api/payments/my
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

            // Subscription period
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
    // ADMIN ENDPOINTS
    // ============================================

    // GET: api/payments/admin
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

            // Subscription period
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
    // ADMIN: RECORD PAYMENT
    // ============================================

    // POST: api/payments/admin
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

      var userIdValue = User.FindFirstValue(
          ClaimTypes.NameIdentifier);

      if (!int.TryParse(userIdValue, out var adminUserId))
        return Unauthorized(new
        {
          message = "Invalid admin token."
        });

      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      try
      {
        // Lock the subscription row before reading payment data.
        // This serializes payment requests for the same subscription.
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

        // Read subscription after acquiring the row lock.
        var subscription = await _context.Subscriptions
            .AsNoTracking()
            .FirstAsync(s =>
                s.SubscriptionId == request.SubscriptionId);

        if (subscription.Status != "Approved")
          return Conflict(new
          {
            message = "Only approved subscriptions can receive payments."
          });

        // Read payment after acquiring the subscription lock.
        var payment = await _context.Payments
            .FirstOrDefaultAsync(p =>
                p.SubscriptionId == request.SubscriptionId);

        // One payment summary record per subscription.
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

        decimal remainingAmount =
            payment.AmountDue - payment.AmountPaid;

        if (request.Amount > remainingAmount)
          return BadRequest(new
          {
            message = "Payment amount exceeds the remaining balance.",
            remainingAmount
          });

        // Update payment amount safely inside the transaction.
        payment.AmountPaid += request.Amount;

        payment.Status =
            payment.AmountPaid >= payment.AmountDue
                ? "Paid"
                : "Partial";

        payment.PaymentDate = DateTime.UtcNow;
        payment.RecordedBy = adminUserId;
        payment.Notes = request.Notes;

        await _context.SaveChangesAsync();

        // Release the lock after successfully saving.
        await transaction.CommitAsync();

        return Ok(new
        {
          message = "Payment recorded successfully.",
          paymentId = payment.PaymentId,
          subscriptionId = payment.SubscriptionId,
          amountDue = payment.AmountDue,
          amountPaid = payment.AmountPaid,
          remainingAmount =
                payment.AmountDue - payment.AmountPaid,
          status = payment.Status
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
      var userIdValue = User.FindFirstValue(
          ClaimTypes.NameIdentifier);

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
