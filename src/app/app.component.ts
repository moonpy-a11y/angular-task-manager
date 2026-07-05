import { afterNextRender, Component, signal, effect } from '@angular/core';
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
        [disabled]="isLoading()"
        class="text-black border-2 p-2 m-2 rounded"
      />
      <button (click)="addTask()" [disabled]="isLoading() || !newTaskTitle.trim()">
        {{ isLoading() ? 'Loading...' : 'Add new task' }}
      </button>
      <div *ngIf="error()" class="error-message text-red-600 p-2 m-2">
        {{ error() }}
      </div>
      <table>
        <tbody>
          @for (task of tasks(); track task.id) {
            @let isComplete = task.status === 'COMPLETE';
            <tr [class.completed]="isComplete">
              <td>
                <input
                  (click)="updateTask(task, { status: isComplete ? 'IN_PROGRESS' : 'COMPLETE' })"
                  type="checkbox"
                  [checked]="isComplete"
                  [disabled]="isLoading()"
                />
              </td>
              <td>{{ task.title }}</td>
              <td>{{ formatStatus(task.status) }}</td>
              <td>
                <button (click)="deleteTask(task)" [disabled]="isLoading()">
                  Delete
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </section>
  `,
  styles: `
    .error-message {
      border: 1px solid #dc2626;
      background-color: #fee2e2;
      border-radius: 0.375rem;
    }
    tr.completed td {
      opacity: 0.6;
      text-decoration: line-through;
    }
  `,
})
export class AppComponent {
  newTaskTitle = '';
  tasks = signal<Task[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  private taskCache: Task[] = [];

  constructor() {
    afterNextRender({
      earlyRead: () => this.getTasks()
    });
  }

  async getTasks() {
    try {
      this.isLoading.set(true);
      this.error.set(null);
      const response = await fetch(`/api/tasks`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const tasks = await response.json();
      this.tasks.set(tasks);
      this.taskCache = [...tasks];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tasks';
      this.error.set(message);
      console.error('Error fetching tasks:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async addTask() {
    if (!this.newTaskTitle.trim()) {
      this.error.set('Task title cannot be empty');
      return;
    }

    // Optimistic update: add to local state immediately
    const optimisticTask: Task = {
      id: `temp-${Date.now()}`,
      title: this.newTaskTitle,
      status: 'IN_PROGRESS',
      createdAt: Date.now(),
    };

    const previousTasks = this.tasks();
    this.tasks.set([optimisticTask, ...previousTasks]);
    this.newTaskTitle = '';

    try {
      this.isLoading.set(true);
      const response = await fetch(`/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: optimisticTask.title,
          status: 'IN_PROGRESS',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Fetch updated list to get the real ID from the server
      await this.getTasks();
      this.error.set(null);
    } catch (err) {
      // Rollback on failure
      this.tasks.set(previousTasks);
      const message = err instanceof Error ? err.message : 'Failed to add task';
      this.error.set(message);
      console.error('Error adding task:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async updateTask(task: Task, newTaskValues: Partial<Task>) {
    // Optimistic update
    const updatedTask = { ...task, ...newTaskValues };
    const previousTasks = this.tasks();
    this.tasks.set(
      previousTasks.map(t => (t.id === task.id ? updatedTask : t))
    );

    try {
      this.isLoading.set(true);
      const response = await fetch(`/api/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTask),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.error.set(null);
    } catch (err) {
      // Rollback on failure
      this.tasks.set(previousTasks);
      const message = err instanceof Error ? err.message : 'Failed to update task';
      this.error.set(message);
      console.error('Error updating task:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  async deleteTask(task: Task) {
    // Optimistic delete
    const previousTasks = this.tasks();
    this.tasks.set(previousTasks.filter(t => t.id !== task.id));

    try {
      this.isLoading.set(true);
      const response = await fetch('/api/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.error.set(null);
    } catch (err) {
      // Rollback on failure
      this.tasks.set(previousTasks);
      const message = err instanceof Error ? err.message : 'Failed to delete task';
      this.error.set(message);
      console.error('Error deleting task:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  formatStatus(status: string): string {
    return status === 'COMPLETE' ? '✓ Completed' : '○ In Progress';
  }
}
