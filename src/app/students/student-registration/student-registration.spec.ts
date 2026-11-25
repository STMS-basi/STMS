import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { StudentRegistration } from './student-registration';
import { StudentService } from '../../services/student.service';

describe('StudentRegistration', () => {
  let studentService: StudentService;
  let authService: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [StudentRegistration],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), StudentService],
    }).compileComponents();

    studentService = TestBed.inject(StudentService);
    authService = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the StudentRegistration component and load students from GET /api/students', () => {
    authService.setSession({
      token: 'jwt',
      role: 'Parent',
      fullName: 'Parent User',
      email: 'parent@example.com',
    });

    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();

    httpTesting.expectOne('/api/students').flush([
      {
        studentId: 11,
        fullName: 'Tariq Parent Child',
        grade: 'Grade 4',
        className: '4A',
      },
    ]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
    expect(component.students().length).toBe(1);
    expect(component.students()[0].fullName).toBe('Tariq Parent Child');
  });

  it('should invalidate an empty form', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component['studentForm'].valid).toBe(false);
  });

  it('should require a full name with at least 3 characters', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const nameControl = component['studentForm'].get('fullName');

    nameControl?.setValue('Ab');
    expect(nameControl?.valid).toBe(false);

    nameControl?.setValue('Ahmad Student');
    expect(nameControl?.valid).toBe(true);
  });

  it('should register a new student successfully using mock data', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const initialCount = studentService.students().length;

    component['studentForm'].setValue({
      fullName: 'Sami Ahmad',
      grade: 'Grade 5',
      className: '5A',
      dateOfBirth: '2015-05-10',
      notes: 'No allergies',
    });

    component['onSubmit']();

    expect(component['errorMessage']()).toBeNull();
    expect(component['successMessage']()).toBeTruthy();
    expect(studentService.students().length).toBe(initialCount + 1);
    const added = studentService.students().find((s) => s.fullName === 'Sami Ahmad');
    expect(added).toBeTruthy();
  });

  it('should support editing an existing student', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    studentService.addStudent({
      fullName: 'Original Name',
      grade: 'Grade 4',
      className: '4B',
    }).subscribe();

    const created = studentService.students().find((s) => s.fullName === 'Original Name')!;
    expect(created).toBeTruthy();

    component['startEdit'](created);
    expect(component['editingStudentId']()).toBe(created.studentId);
    expect(component['studentForm'].get('fullName')?.value).toBe('Original Name');

    component['studentForm'].patchValue({ fullName: 'Updated Student Name' });
    component['onSubmit']();

    expect(component['successMessage']()).toBeTruthy();
    const updated = studentService.students().find((s) => s.studentId === created.studentId);
    expect(updated?.fullName).toBe('Updated Student Name');
  });

  it('should delete a student from the mock list', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    studentService.addStudent({
      fullName: 'To Be Deleted',
      grade: 'Grade 6',
      className: '6A',
    }).subscribe();

    const created = studentService.students().find((s) => s.fullName === 'To Be Deleted')!;
    expect(created).toBeTruthy();

    component['deleteStudent'](created.studentId);
    expect(studentService.students().some((s) => s.studentId === created.studentId)).toBe(false);
  });

  it('should reject a future Date of Birth and show validation error on submit', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const dobControl = component['studentForm'].get('dateOfBirth');

    dobControl?.setValue('2030-02-22');
    expect(dobControl?.valid).toBe(false);
    expect(dobControl?.hasError('futureDate')).toBe(true);

    component['onSubmit']();
    fixture.detectChanges();

    expect(component['isFieldInvalid']('dateOfBirth')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(component['t']().studentDobFutureError);

    dobControl?.setValue('2016-05-10');
    expect(dobControl?.valid).toBe(true);
  });
});
