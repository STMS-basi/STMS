
using System.ComponentModel.DataAnnotations;

namespace STMS.Api.DTOs.Routes
{
  public class CreateRouteRequest
  {
    [Required]
    [MaxLength(20)]
    public string RouteNumber { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string StartPoint { get; set; } = string.Empty;

    [Required]
    [MaxLength(150)]
    public string Destination { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string ServiceArea { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int Capacity { get; set; }

    public int? BusId { get; set; }

    public int? DriverId { get; set; }
  }
}
