import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { AuthService } from './auth.service';

export interface StudentItem {
  readonly studentId: number;
  readonly parentId?: number;
  readonly parentEmail?: string;
  readonly fullName: string;
  readonly grade: string;
  readonly className: string;
  readonly dateOfBirth?: string;
  readonly notes?: string;
}

export interface CreateStudentPayload {
  readonly fullName: string;
  readonly grade: string;
  readonly className: string;
  readonly dateOfBirth?: string;
  readonly notes?: string;
}

const LOCAL_STUDENTS_KEY = 'stms_parent_students';

const INITIAL_DEMO_STUDENTS: readonly StudentItem[] = [
  {
    studentId: 101,
    parentEmail: 'parent@stms.edu',
    fullName: 'Yousef Al Basi',
    grade: 'Grade 5',
    className: '5A',
    dateOfBirth: '2015-04-12',
    notes: 'Supervised pickup stop requested',
  },
  {
    studentId: 102,
    parentEmail: 'parent@stms.edu',
    fullName: 'Layan Al Basi',
    grade: 'Grade 2',
    className: '2B',
    dateOfBirth: '2018-09-20',
    notes: 'Prefers front seats near bus supervisor',
  },
];

@Injectable({
  providedIn: 'root',
})
export class StudentService {
  private readonly authService = inject(AuthService);

  private readonly studentsSignal = signal<StudentItem[]>(this.loadStoredStudents());
  public readonly students = this.studentsSignal.asReadonly();

  public getParentEmail(): string {
    return this.authService.userEmail()?.trim().toLowerCase() || 'parent@stms.edu';
  }

  private getStorageKey(): string {
    return `${LOCAL_STUDENTS_KEY}_${this.getParentEmail()}`;
  }

  private loadStoredStudents(): StudentItem[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(this.getStorageKey());
        if (stored) {
          const parsed = JSON.parse(stored) as StudentItem[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {
      // Ignore storage read errors
    }
    // Return sample mock students for immediate testing without backend
    return INITIAL_DEMO_STUDENTS.map((s) => ({
      ...s,
      parentEmail: this.getParentEmail(),
    }));
  }

  private persistStoredStudents(items: StudentItem[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.getStorageKey(), JSON.stringify(items));
      }
    } catch {
      // Ignore storage write errors
    }
  }

  public fetchStudents(): Observable<StudentItem[]> {
    const currentLocal = this.loadStoredStudents();
    this.studentsSignal.set(currentLocal);
    return of(currentLocal);
  }

  public addStudent(payload: CreateStudentPayload): Observable<{ success: boolean; studentId: number }> {
    const localId = Date.now();
    const newStudent: StudentItem = {
      studentId: localId,
      parentEmail: this.getParentEmail(),
      fullName: payload.fullName.trim(),
      grade: payload.grade.trim(),
      className: payload.className.trim(),
      dateOfBirth: payload.dateOfBirth,
      notes: payload.notes?.trim(),
    };
    const updated = [...this.studentsSignal(), newStudent];
    this.studentsSignal.set(updated);
    this.persistStoredStudents(updated);

    return of({ success: true, studentId: localId });
  }

  public updateStudent(id: number, payload: CreateStudentPayload): Observable<{ success: boolean }> {
    const current = this.studentsSignal().find((s) => s.studentId === id);
    if (!current || (current.parentEmail && current.parentEmail !== this.getParentEmail())) {
      // Prevent modifying students registered under another parent account
      return of({ success: false });
    }

    const updated = this.studentsSignal().map((s) =>
      s.studentId === id
        ? {
            ...s,
            fullName: payload.fullName.trim(),
            grade: payload.grade.trim(),
            className: payload.className.trim(),
            dateOfBirth: payload.dateOfBirth,
            notes: payload.notes?.trim(),
          }
        : s
    );
    this.studentsSignal.set(updated);
    this.persistStoredStudents(updated);

    return of({ success: true });
  }

  public deleteStudent(id: number): Observable<{ success: boolean }> {
    const current = this.studentsSignal().find((s) => s.studentId === id);
    if (!current || (current.parentEmail && current.parentEmail !== this.getParentEmail())) {
      // Prevent deleting students registered under another parent account
      return of({ success: false });
    }

    const updated = this.studentsSignal().filter((s) => s.studentId !== id);
    this.studentsSignal.set(updated);
    this.persistStoredStudents(updated);

    return of({ success: true });
  }
}
