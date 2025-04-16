import { z } from "zod";

export const taskSchema = z.object({
    plan: z.string().optional().describe("The plan to achieve the task"),
    meta: z.any().optional().describe("Metadata associated with the task"),
    actions: z.array(
      z.object({
        type: z.string().describe("The type of action to perform"),
        context: z.string().describe("The context in which to perform the action"),
        payload: z.any().describe("The payload for the action"),
      })
    ).describe("Specific actions required to complete this task"),
  });
  
  export const goalSchema = z
    .object({
      id: z.string().describe("Unique identifier for the goal"),
      description: z.string().describe("A description of the goal"),
      success_criteria: z.array(z.string()).describe("The criteria for success"),
      dependencies: z.array(z.string()).describe("The dependencies of the goal"),
      priority: z.number().min(1).max(10).describe("The priority of the goal (1-10)"),
      required_resources: z
        .array(z.string())
        .describe("The resources needed to achieve the goal"),
      estimated_difficulty: z
        .number()
        .min(1)
        .max(10)
        .describe("The estimated difficulty of the goal (1-10)"),
      tasks: z
        .array(taskSchema)
        .describe(
          "The tasks to achieve the goal. This is where you build potential tasks you need todo, based on your understanding of what you can do. These are actions."
        ),
    })
    .describe("A goal to be achieved");
  
  export const goalPlanningSchema = z.object({
    long_term: z
      .array(goalSchema)
      .describe("Strategic goals that are the main goals you want to achieve"),
    medium_term: z
      .array(goalSchema)
      .describe(
        "Tactical goals that will require many short term goals to achieve"
      ),
    short_term: z
      .array(goalSchema)
      .describe(
        "Immediate actionable goals that will require a few tasks to achieve"
      ),
    history: z.array(z.string()).optional().describe("History of goal changes")
  });