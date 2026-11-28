
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using STMS.Infrastructure.Data;

namespace STMS.Api.Controllers
{
    [ApiController]
    [Route("api/students/admin")]
    [Authorize(Roles = "Admin")]
    public class AdminStudentsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AdminStudentsController(AppDbContext context)
        {
            _context = context;
        }

        // GET /api/students/admin
        // Admin only: Get all registered students
        [HttpGet]
        public async Task<IActionResult> GetAllStudents()
        {
            var students = await (
                from student in _context.Students.AsNoTracking()
                join parent in _context.Parents.AsNoTracking()
                    on student.ParentId equals parent.ParentId
                orderby student.StudentId
                select new
                {
                    student.StudentId,
                    student.FullName,
                    student.Grade,
                    student.ClassName,
                    student.DateOfBirth,
                    student.Notes,
                    student.ParentId,
                    ParentName = parent.FullName
                }
            ).ToListAsync();

            return Ok(students);
        }
    }
}
