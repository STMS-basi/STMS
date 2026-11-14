import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { StudentRegistration } from './student-registration';
import { StudentService } from '../../services/student.service';

describe('StudentRegistration', () => {
  let studentService: StudentService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [StudentRegistration],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), StudentService],
    }).compileComponents();

    studentService = TestBed.inject(StudentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should create the StudentRegistration component', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    httpMock.expectOne('/api/students').flush([]);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should invalidate an empty form', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    httpMock.expectOne('/api/students').flush([]);
    const component = fixture.componentInstance;
    expect(component['studentForm'].valid).toBe(false);
  });

  it('should require a full name with at least 3 characters', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    httpMock.expectOne('/api/students').flush([]);
    const component = fixture.componentInstance;
    const nameControl = component['studentForm'].get('fullName');

    nameControl?.setValue('Ab');
    expect(nameControl?.valid).toBe(false);

    nameControl?.setValue('Ahmad Student');
    expect(nameControl?.valid).toBe(true);
  });

  it('should register a new student successfully', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    httpMock.expectOne('/api/students').flush([]);
    const component = fixture.componentInstance;

    component['studentForm'].setValue({
      fullName: 'Sami Ahmad',
      grade: 'Grade 5',
      className: '5A',
      dateOfBirth: '2015-05-10',
      notes: 'No allergies',
    });

    component['onSubmit']();

    const postReq = httpMock.expectOne('/api/students');
    expect(postReq.request.method).toBe('POST');
    postReq.flush({ message: 'Success', studentId: 101 });

    expect(component['errorMessage']()).toBeNull();
    expect(component['successMessage']()).toBeTruthy();
    expect(studentService.students().length).toBeGreaterThan(0);
    expect(studentService.students()[0].fullName).toBe('Sami Ahmad');
  });

  it('should support editing an existing student', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    httpMock.expectOne('/api/students').flush([]);
    const component = fixture.componentInstance;

    studentService.addStudent({
      fullName: 'Original Name',
      grade: 'Grade 4',
      className: '4B',
    }).subscribe();
    httpMock.expectOne('/api/students').flush({ message: 'Created', studentId: 201 });

    const created = studentService.students()[0];
    expect(created).toBeTruthy();

    component['startEdit'](created);
    expect(component['editingStudentId']()).toBe(created.studentId);
    expect(component['studentForm'].get('fullName')?.value).toBe('Original Name');

    component['studentForm'].patchValue({ fullName: 'Updated Student Name' });
    component['onSubmit']();

    const putReq = httpMock.expectOne('/api/students/' + created.studentId);
    expect(putReq.request.method).toBe('PUT');
    putReq.flush({ message: 'Updated' });

    expect(component['successMessage']()).toBeTruthy();
    const updated = studentService.students().find((s) => s.studentId === created.studentId);
    expect(updated?.fullName).toBe('Updated Student Name');
  });

  it('should delete a student from the list', () => {
    const fixture = TestBed.createComponent(StudentRegistration);
    fixture.detectChanges();
    httpMock.expectOne('/api/students').flush([]);
    const component = fixture.componentInstance;

    studentService.addStudent({
      fullName: 'To Be Deleted',
      grade: 'Grade 6',
      className: '6A',
    }).subscribe();
    httpMock.expectOne('/api/students').flush({ message: 'Created', studentId: 301 });

    const created = studentService.students()[0];
    component['deleteStudent'](created.studentId);

    const delReq = httpMock.expectOne('/api/students/' + created.studentId);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ message: 'Deleted' });

    expect(studentService.students().some((s) => s.studentId === created.studentId)).toBe(false);
  });
});
