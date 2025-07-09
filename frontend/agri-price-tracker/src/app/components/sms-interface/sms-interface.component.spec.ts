import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SmsInterfaceComponent } from './sms-interface.component';

describe('SmsInterfaceComponent', () => {
  let component: SmsInterfaceComponent;
  let fixture: ComponentFixture<SmsInterfaceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SmsInterfaceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SmsInterfaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
