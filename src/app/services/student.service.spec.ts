import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { StudentService } from './student.service';
import { AuthService } from './auth.service';

describe('StudentService', () => {
  let service: StudentService;
  let authService: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        StudentService,
        AuthService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(StudentService);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should associate registered students with the logged in parent email', () => {
    authService.setSession({
      token: 'parent.token',
      role: 'Parent',
      fullName: 'Ahmad Guardian',
      email: 'parent1@example.com',
    });

    service.addStudent({
      fullName: 'Student One',
      grade: 'Grade 3',
      className: '3A',
    }).subscribe();

    expect(service.students().length).toBeGreaterThan(0);
    const added = service.students().find((s) => s.fullName === 'Student One');
    expect(added?.parentEmail).toBe('parent1@example.com');
  });

  it('should isolate students across different parent accounts in localStorage', () => {
    // Parent 1 session
    authService.setSession({
      token: 'parent.token.1',
      role: 'Parent',
      fullName: 'Parent One',
      email: 'parent1@example.com',
    });

    service.addStudent({
      fullName: 'Student of Parent One',
      grade: 'Grade 4',
      className: '4A',
    }).subscribe();

    const parentOneStudents = service.students().map((s) => s.fullName);
    expect(parentOneStudents).toContain('Student of Parent One');

    // Switch to Parent 2
    authService.setSession({
      token: 'parent.token.2',
      role: 'Parent',
      fullName: 'Parent Two',
      email: 'parent2@example.com',
    });

    service.fetchStudents().subscribe();

    // Parent 2 should NOT see Parent 1's newly added student
    const parentTwoStudents = service.students().map((s) => s.fullName);
    expect(parentTwoStudents).not.toContain('Student of Parent One');
  });

  it('should prevent updating or deleting a student registered under another parent', () => {
    authService.setSession({
      token: 'parent.token.1',
      role: 'Parent',
      fullName: 'Parent One',
      email: 'parent1@example.com',
    });

    service.addStudent({
      fullName: 'Original Student',
      grade: 'Grade 5',
      className: '5B',
    }).subscribe();

    const student = service.students().find((s) => s.fullName === 'Original Student')!;
    expect(student).toBeTruthy();

    // Impersonate Parent 2 trying to update Parent 1's student
    authService.setSession({
      token: 'parent.token.2',
      role: 'Parent',
      fullName: 'Parent Two',
      email: 'attacker@example.com',
    });

    service.updateStudent(student.studentId, {
      fullName: 'Hacked Name',
      grade: 'Grade 12',
      className: '12C',
    }).subscribe((res) => {
      expect(res.success).toBe(false);
    });

    service.deleteStudent(student.studentId).subscribe((res) => {
      expect(res.success).toBe(false);
    });
  });
});
