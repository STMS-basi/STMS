using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using STMS.Api.DTOs.Drivers;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
  [ApiController]
  [Route("api/drivers")]
  public class DriversController : ControllerBase
  {
    private readonly AppDbContext _context;

    public DriversController(AppDbContext context)
    {
      _context = context;
    }

    // GET /api/drivers/admin
    // Admin: Get all drivers
    [HttpGet("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetAllDrivers()
    {
      var drivers = await _context.Drivers
          .AsNoTracking()
          .OrderBy(d => d.DriverId)
          .Select(d => new
          {
            d.DriverId,
            d.FullName,
            d.Phone,
            d.LicenseNumber,
            d.IsActive
          })
          .ToListAsync();

      return Ok(drivers);
    }

    // GET /api/drivers/admin/{id}
    // Admin: Get driver details
    [HttpGet("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> GetDriverById(int id)
    {
      var driver = await _context.Drivers
          .AsNoTracking()
          .FirstOrDefaultAsync(d => d.DriverId == id);

      if (driver == null)
      {
        return NotFound(new
        {
          message = "Driver not found."
        });
      }

      return Ok(new
      {
        driver.DriverId,
        driver.FullName,
        driver.Phone,
        driver.LicenseNumber,
        driver.IsActive
      });
    }

    // POST /api/drivers/admin
    // Admin: Create driver
    [HttpPost("admin")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> CreateDriver(
        [FromBody] CreateDriverRequest request)
    {
      if (string.IsNullOrWhiteSpace(request.FullName))
      {
        return BadRequest(new
        {
          message = "Driver full name is required."
        });
      }

      if (string.IsNullOrWhiteSpace(request.Phone))
      {
        return BadRequest(new
        {
          message = "Phone number is required."
        });
      }

      var licenseNumber = request.LicenseNumber?.Trim();

      if (!string.IsNullOrEmpty(licenseNumber))
      {
        var duplicateLicense = await _context.Drivers
            .AnyAsync(d => d.LicenseNumber == licenseNumber);

        if (duplicateLicense)
        {
          return Conflict(new
          {
            message =
                  "A driver with this license number already exists."
          });
        }
      }

      var driver = new STMS.Core.Entities.Driver
      {
        FullName = request.FullName.Trim(),
        Phone = request.Phone.Trim(),
        LicenseNumber = string.IsNullOrEmpty(licenseNumber)
              ? null
              : licenseNumber,
        IsActive = true
      };

      _context.Drivers.Add(driver);

      await _context.SaveChangesAsync();

      return StatusCode(201, new
      {
        message = "Driver created successfully.",
        driverId = driver.DriverId,
        fullName = driver.FullName,
        phone = driver.Phone,
        licenseNumber = driver.LicenseNumber
      });
    }

    // PUT /api/drivers/admin/{id}
    // Admin: Update driver
    [HttpPut("admin/{id:int}")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> UpdateDriver(
        int id,
        [FromBody] UpdateDriverRequest request)
    {
      var driver = await _context.Drivers
          .FirstOrDefaultAsync(d => d.DriverId == id);

      if (driver == null)
      {
        return NotFound(new
        {
          message = "Driver not found."
        });
      }

      if (string.IsNullOrWhiteSpace(request.FullName))
      {
        return BadRequest(new
        {
          message = "Driver full name is required."
        });
      }

      if (string.IsNullOrWhiteSpace(request.Phone))
      {
        return BadRequest(new
        {
          message = "Phone number is required."
        });
      }

      var licenseNumber = request.LicenseNumber?.Trim();

      if (!string.IsNullOrEmpty(licenseNumber))
      {
        var duplicateLicense = await _context.Drivers
            .AnyAsync(d =>
                d.LicenseNumber == licenseNumber &&
                d.DriverId != id);

        if (duplicateLicense)
        {
          return Conflict(new
          {
            message =
                  "A driver with this license number already exists."
          });
        }
      }

      driver.FullName = request.FullName.Trim();
      driver.Phone = request.Phone.Trim();
      driver.LicenseNumber = string.IsNullOrEmpty(licenseNumber)
          ? null
          : licenseNumber;

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Driver updated successfully.",
        driverId = driver.DriverId,
        fullName = driver.FullName,
        phone = driver.Phone,
        licenseNumber = driver.LicenseNumber
      });
    }

    // PATCH /api/drivers/admin/{id}/deactivate
    // Admin: Deactivate driver
    [HttpPatch("admin/{id:int}/deactivate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> DeactivateDriver(int id)
    {
      // The transaction and driver row lock prevent
      // concurrent route assignment and deactivation
      // from making conflicting decisions.
      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      if (!await LockDriverAsync(id))
      {
        return NotFound(new
        {
          message = "Driver not found."
        });
      }

      var driver = await _context.Drivers
          .FirstOrDefaultAsync(d => d.DriverId == id);

      if (driver == null)
      {
        return NotFound(new
        {
          message = "Driver not found."
        });
      }

      if (!driver.IsActive)
      {
        return BadRequest(new
        {
          message = "Driver is already inactive."
        });
      }

      // Load route statuses and check in C#
      // to avoid Oracle Boolean translation issues.
      var assignedRoutes = await _context.Routes
          .AsNoTracking()
          .Where(r => r.DriverId == id)
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
          message =
                "Cannot deactivate a driver assigned to an active route."
        });
      }

      driver.IsActive = false;

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Driver deactivated successfully.",
        driverId = driver.DriverId
      });
    }

    // PATCH /api/drivers/admin/{id}/activate
    // Admin: Activate driver
    [HttpPatch("admin/{id:int}/activate")]
    [Authorize(Roles = "Admin")]
    public async Task<IActionResult> ActivateDriver(int id)
    {
      await using var transaction =
          await _context.Database.BeginTransactionAsync();

      if (!await LockDriverAsync(id))
      {
        return NotFound(new
        {
          message = "Driver not found."
        });
      }

      var driver = await _context.Drivers
          .FirstOrDefaultAsync(d => d.DriverId == id);

      if (driver == null)
      {
        return NotFound(new
        {
          message = "Driver not found."
        });
      }

      if (driver.IsActive)
      {
        return BadRequest(new
        {
          message = "Driver is already active."
        });
      }

      driver.IsActive = true;

      await _context.SaveChangesAsync();
      await transaction.CommitAsync();

      return Ok(new
      {
        message = "Driver activated successfully.",
        driverId = driver.DriverId
      });
    }

    // ========================================
    // HELPERS
    // ========================================

    private async Task<bool> LockDriverAsync(int driverId)
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
          "SELECT DRIVERID FROM DRIVERS " +
          "WHERE DRIVERID = :id FOR UPDATE";

      command.CommandTimeout = 30;

      var parameter = command.CreateParameter();
      parameter.ParameterName = "id";
      parameter.Value = driverId;

      command.Parameters.Add(parameter);

      await using var reader =
          await command.ExecuteReaderAsync();

      return await reader.ReadAsync();
    }
  }
}
