import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatbotWidgetComponent } from './chatbot-widget.component';

describe('ChatbotWidgetComponent', () => {
  let component: ChatbotWidgetComponent;
  let fixture: ComponentFixture<ChatbotWidgetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatbotWidgetComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatbotWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
