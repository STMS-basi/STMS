
using System.ComponentModel.DataAnnotations;

namespace STMS.Api.DTOs.Drivers
{
  public class CreateDriverRequest
  {
    [Required(ErrorMessage = "Driver full name is required.")]
    [MaxLength(150)]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Phone number is required.")]
    [MaxLength(20)]
    public string Phone { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? LicenseNumber { get; set; }
  }
}
