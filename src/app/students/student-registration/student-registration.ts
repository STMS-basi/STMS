import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Header } from '../../header/header';
import { PreferencesService } from '../../services/preferences.service';
import { CreateStudentPayload, StudentItem, StudentService } from '../../services/student.service';

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function pastDateValidator(control: AbstractControl): ValidationErrors | null {
  const raw = typeof control.value === 'string' ? control.value.trim() : '';
  if (!raw) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    return { invalidDate: true };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    year < 1900 ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return { invalidDate: true };
  }

  if (raw > getLocalTodayIso()) {
    return { futureDate: true };
  }

  return null;
}

@Component({
  selector: 'app-student-registration',
  imports: [ReactiveFormsModule, RouterLink, Header],
  templateUrl: './student-registration.html',
  styleUrl: './student-registration.css',
})
export class StudentRegistration implements OnInit {
  protected readonly prefs = inject(PreferencesService);
  protected readonly t = this.prefs.t;

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly studentService = inject(StudentService);

  public readonly students = this.studentService.students;
  protected readonly maxDobDate = getLocalTodayIso();
  protected readonly editingStudentId = signal<number | null>(null);
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly successMessage = signal<string | null>(null);

  protected readonly gradeOptions = [
    'Kindergarten',
    'Grade 1',
    'Grade 2',
    'Grade 3',
    'Grade 4',
    'Grade 5',
    'Grade 6',
    'Grade 7',
    'Grade 8',
    'Grade 9',
    'Grade 10',
    'Grade 11',
    'Grade 12',
  ];

  protected readonly studentForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    grade: ['', [Validators.required]],
    className: ['', [Validators.required]],
    dateOfBirth: ['', [pastDateValidator]],
    notes: [''],
  });

  public ngOnInit(): void {
    this.studentService.fetchStudents().subscribe();
  }

  protected isFieldInvalid(fieldName: string): boolean {
    const control = this.studentForm.get(fieldName);
    return Boolean(control && control.invalid && (control.dirty || control.touched));
  }

  protected onSubmit(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.studentForm.invalid) {
      this.studentForm.markAllAsTouched();
      this.errorMessage.set(this.t().regGenericError);
      return;
    }

    this.isSubmitting.set(true);
    const formVals = this.studentForm.getRawValue();
    const payload: CreateStudentPayload = {
      fullName: formVals.fullName.trim(),
      grade: formVals.grade.trim(),
      className: formVals.className.trim(),
      dateOfBirth: formVals.dateOfBirth || undefined,
      notes: formVals.notes?.trim() || undefined,
    };

    const editId = this.editingStudentId();
    if (editId !== null) {
      this.studentService.updateStudent(editId, payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.successMessage.set(this.t().studentUpdatedSuccess);
          this.resetForm();
        },
        error: () => {
          this.isSubmitting.set(false);
          this.errorMessage.set(this.t().serverConnectionError);
        },
      });
    } else {
      this.studentService.addStudent(payload).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.successMessage.set(this.t().studentSavedSuccess);
          this.resetForm();
        },
        error: () => {
          this.isSubmitting.set(false);
          this.errorMessage.set(this.t().serverConnectionError);
        },
      });
    }
  }

  protected startEdit(student: StudentItem): void {
    this.editingStudentId.set(student.studentId);
    this.studentForm.setValue({
      fullName: student.fullName,
      grade: student.grade,
      className: student.className,
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : '',
      notes: student.notes || '',
    });
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  protected cancelEdit(): void {
    this.resetForm();
  }

  protected deleteStudent(studentId: number): void {
    this.studentService.deleteStudent(studentId).subscribe({
      next: () => {
        if (this.editingStudentId() === studentId) {
          this.resetForm();
        }
        this.successMessage.set(this.t().studentDeletedSuccess);
      },
      error: () => {
        this.errorMessage.set(this.t().serverConnectionError);
      },
    });
  }

  private resetForm(): void {
    this.editingStudentId.set(null);
    this.studentForm.reset({
      fullName: '',
      grade: '',
      className: '',
      dateOfBirth: '',
      notes: '',
    });
  }
}

