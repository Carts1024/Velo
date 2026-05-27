"use client";

import { api } from "@repo/backend/convex/_generated/api";
import { Button } from "@repo/ui/components/ui/button";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { cn } from "@repo/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";
import { useState } from "react";

export default function Todo() {
  // Read data
  const tasks = useQuery(api.tasks.list);
  console.log(tasks);

  // Write data
  const createTask = useMutation(api.tasks.create);
  const toggleTask = useMutation(api.tasks.toggle);
  const deleteTask = useMutation(api.tasks.remove);

  // State for new task input
  const [newTaskText, setNewTaskText] = useState("");

  const handleAddTask = () => {
    if (newTaskText.trim()) {
      createTask({ todo: newTaskText.trim() });
      setNewTaskText("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleAddTask();
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Todo List</h1>

        {/* Add Task Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Add a new task..."
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button onClick={handleAddTask} disabled={!newTaskText.trim()}>
            Add
          </Button>
        </div>

        {/* Task List */}
        <ul className="space-y-1">
          {tasks?.map((task) => (
            <li
              key={task._id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/50",
                task.completed && "opacity-60",
              )}
            >
              <div className="flex flex-1 items-center gap-3">
                <Checkbox
                  checked={task.completed}
                  onCheckedChange={() => toggleTask({ id: task._id })}
                />
                <span
                  className={cn("text-sm", task.completed && "text-muted-foreground line-through")}
                >
                  {task.todo}
                </span>
              </div>
              <Button variant="ghost" size="icon-xs" onClick={() => deleteTask({ id: task._id })}>
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
          {tasks?.length === 0 && (
            <li className="py-8 text-center text-sm text-muted-foreground">
              No tasks yet. Add one above!
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
