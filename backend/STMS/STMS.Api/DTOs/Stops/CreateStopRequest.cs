
using System.ComponentModel.DataAnnotations;

namespace STMS.Api.DTOs.Stops
{
  public class CreateStopRequest
  {
    [Range(1, int.MaxValue)]
    public int RouteId { get; set; }

    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int StopOrder { get; set; }

    [RegularExpression(
        @"^([01]\d|2[0-3]):[0-5]\d$",
        ErrorMessage = "Time must be in HH:mm format.")]
    public string? PickupTime { get; set; }

    [RegularExpression(
        @"^([01]\d|2[0-3]):[0-5]\d$",
        ErrorMessage = "Time must be in HH:mm format.")]
    public string? DropoffTime { get; set; }
  }
}
