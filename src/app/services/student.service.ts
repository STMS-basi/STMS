import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthService } from './auth.service';

export interface StudentItem {
  readonly studentId: number;
  readonly parentId?: number;
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

@Injectable({
  providedIn: 'root',
})
export class StudentService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly studentsSignal = signal<StudentItem[]>(this.loadStoredStudents());
  public readonly students = this.studentsSignal.asReadonly();

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.token();
    let headers = new HttpHeaders();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private loadStoredStudents(): StudentItem[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem(LOCAL_STUDENTS_KEY);
        if (stored) {
          return JSON.parse(stored) as StudentItem[];
        }
      }
    } catch {
      // Ignore storage read errors
    }
    return [];
  }

  private persistStoredStudents(items: StudentItem[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(LOCAL_STUDENTS_KEY, JSON.stringify(items));
      }
    } catch {
      // Ignore storage write errors
    }
  }

  public fetchStudents(): Observable<StudentItem[]> {
    return this.http
      .get<StudentItem[]>('/api/students', { headers: this.getAuthHeaders() })
      .pipe(
        tap((serverStudents) => {
          if (Array.isArray(serverStudents) && serverStudents.length > 0) {
            this.studentsSignal.set(serverStudents);
            this.persistStoredStudents(serverStudents);
          }
        }),
        catchError(() => of(this.studentsSignal()))
      );
  }

  public addStudent(payload: CreateStudentPayload): Observable<{ success: boolean; studentId: number }> {
    const localId = Date.now();
    const newStudent: StudentItem = {
      studentId: localId,
      fullName: payload.fullName.trim(),
      grade: payload.grade.trim(),
      className: payload.className.trim(),
      dateOfBirth: payload.dateOfBirth,
      notes: payload.notes?.trim(),
    };
    const updated = [...this.studentsSignal(), newStudent];
    this.studentsSignal.set(updated);
    this.persistStoredStudents(updated);

    return this.http
      .post<{ message: string; studentId: number }>('/api/students', payload, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        map((res) => ({ success: true, studentId: res.studentId || localId })),
        catchError(() => of({ success: true, studentId: localId }))
      );
  }

  public updateStudent(id: number, payload: CreateStudentPayload): Observable<{ success: boolean }> {
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

    return this.http
      .put<{ message: string }>('/api/students/' + id, payload, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        map(() => ({ success: true })),
        catchError(() => of({ success: true }))
      );
  }

  public deleteStudent(id: number): Observable<{ success: boolean }> {
    const updated = this.studentsSignal().filter((s) => s.studentId !== id);
    this.studentsSignal.set(updated);
    this.persistStoredStudents(updated);

    return this.http
      .delete<{ message: string }>('/api/students/' + id, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        map(() => ({ success: true })),
        catchError(() => of({ success: true }))
      );
  }
}
