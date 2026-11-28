
using System.ComponentModel.DataAnnotations;

namespace STMS.Api.DTOs.Buses
{
  public class CreateBusRequest
  {
    [Required]
    [MaxLength(20)]
    public string PlateNumber { get; set; } = string.Empty;

    [Range(1, int.MaxValue,
        ErrorMessage = "Capacity must be greater than zero.")]
    public int Capacity { get; set; }
  }
}
