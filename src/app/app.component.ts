import { afterNextRender, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Task = {
  id: string;
  title: string;
  status: 'IN_PROGRESS' | 'COMPLETE';
  createdAt: number;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section>
      <input
        type="text"
        placeholder="New Task Title"
        [(ngModel)]="newTaskTitle"
        class="text-black border-2 p-2 m-2 rounded"
      />
      <button (click)="addTask()">Add new task</button>
      <table>
        <tbody>
          @for (task of tasks(); track task) {
            @let isComplete = task.status === 'COMPLETE';
            <tr>
              <td>
                <input
                  (click)="updateTask(task, { status: isComplete ? 'IN_PROGRESS' : 'COMPLETE' })"
                  type="checkbox"
                  [checked]="isComplete"
                />
              </td>
              <td>{{ task.title }}</td>
              <td>{{ task.status }}</td>
              <td>
                <button (click)="deleteTask(task)">Delete</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
  styles: '',
})
export class AppComponent {
  newTaskTitle = '';
  tasks = signal<Task[]>([]);

  constructor() {
    afterNextRender({
      earlyRead: () => this.getTasks()
    });
  }

  async getTasks() {
    const response = await fetch(`/api/tasks`);
    const tasks = await response.json();
    this.tasks.set(tasks);
  }

  async addTask() {
    await fetch(`/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: this.newTaskTitle,
        status: 'IN_PROGRESS',
        createdAt: Date.now(),
      }),
    });
    this.newTaskTitle = '';
    await this.getTasks();
  }

  async updateTask(task: Task, newTaskValues: Partial<Task>) {
    await fetch(`/api/tasks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, ...newTaskValues }),
    });
    await this.getTasks();
  }

  async deleteTask(task: any) {
    await fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
    await this.getTasks();
  }
}
