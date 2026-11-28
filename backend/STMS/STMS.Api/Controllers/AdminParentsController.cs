
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
    [ApiController]
    [Route("api/parents/admin")]
    [Authorize(Roles = "Admin")]
    public class AdminParentsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AdminParentsController(AppDbContext context)
        {
            _context = context;
        }

        // GET /api/parents/admin
        // Admin only: Get all registered parents
        [HttpGet]
        public async Task<IActionResult> GetAllParents()
        {
            var parents = await (
                from parent in _context.Parents.AsNoTracking()
                join user in _context.Users.AsNoTracking()
                    on parent.UserId equals user.UserId
                where user.Role == "Parent"
                orderby parent.ParentId
                select new
                {
                    parent.ParentId,
                    parent.UserId,
                    parent.FullName,
                    user.Email,
                    parent.Phone,
                    parent.Address,
                    user.IsActive,
                    StudentCount = _context.Students.Count(
                        student => student.ParentId == parent.ParentId)
                }
            ).ToListAsync();

            return Ok(parents);
        }
    }
}
