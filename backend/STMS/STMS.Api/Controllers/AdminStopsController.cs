
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
    [ApiController]
    [Route("api/stops/admin")]
    [Authorize(Roles = "Admin")]
    public class AdminStopsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AdminStopsController(AppDbContext context)
        {
            _context = context;
        }

        // GET /api/stops/admin
        // Admin only: Get all stops, including inactive routes
        [HttpGet]
        public async Task<IActionResult> GetAllStops()
        {
            var stops = await _context.Stops
                .AsNoTracking()
                .OrderBy(s => s.RouteId)
                .ThenBy(s => s.StopOrder)
                .ThenBy(s => s.StopId)
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
    }
}
