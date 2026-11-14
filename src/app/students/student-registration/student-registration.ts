import { Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Header } from '../../header/header';
import { PreferencesService } from '../../services/preferences.service';
import { CreateStudentPayload, StudentItem, StudentService } from '../../services/student.service';

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
    dateOfBirth: [''],
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
      dateOfBirth: student.dateOfBirth || '',
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

