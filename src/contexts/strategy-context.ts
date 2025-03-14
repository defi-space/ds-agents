import { context, render } from "@daydreamsai/core";
import { z } from "zod";
import { getCurrentAgentId } from "../utils/starknet";

// Define schemas for strategy planner
const strategyTypeSchema = z.string().describe("Type of strategy the agent wants to explore");

// Define action sequence for the strategy
const strategyActionSchema = z.object({
  actionType: z.string().describe("Type of action to take"),
  priority: z.number().min(1).max(10).describe("Priority of this action (1-10)"),
  description: z.string().describe("Description of the action"),
  expectedOutcome: z.string().describe("Expected outcome of the action"),
  reasoning: z.string().optional().describe("Reasoning behind this action"),
  blockchain_actions: z.array(z.string()).optional().describe("Specific blockchain actions to execute")
});

// Define schema for full strategy
const strategySchema = z.object({
  id: z.string().describe("Unique identifier for this strategy"),
  name: z.string().describe("Name of the strategy"),
  type: z.string().describe("Type of strategy"),
  goal: z.string().describe("Goal of the strategy"),
  targetToken: z.string().describe("Target token for accumulation"),
  timeframe: z.string().describe("Timeframe for the strategy"),
  riskAssessment: z.string().describe("Assessment of the strategy's risk level"),
  actions: z.array(strategyActionSchema).describe("Sequence of actions to take"),
  experimentalAspects: z.array(z.string()).optional().describe("Experimental or innovative aspects of this strategy"),
  hypotheses: z.array(z.string()).optional().describe("Hypotheses to test with this strategy")
});

// Define interface for memory
export interface StrategyMemory {
  agentId: string;
  currentStrategy: z.infer<typeof strategySchema> | null;
  alternativeIdeas: Array<{
    concept: string;
    hypothesis: string;
    potentialBenefit: string;
  }>;
  marketObservations: {
    patterns: string[];
    opportunities: string[];
    resourceFlows: string[];
  };
  progressToGoal: {
    currentAmount: number;
    targetAmount: number;
    percentageComplete: number;
  };
  insights: {
    timestamp: number;
    observation: string;
    implications: string;
  }[];
  learnings: {
    timestamp: number;
    experiment: string;
    result: string;
    adaptation: string;
  }[];
}

// Create the strategy planner context
export const strategyContext = context({
  type: "strategy",
  
  schema: z.object({
    id: z.string().describe("Unique identifier for this strategy context instance"),
  }),
  
  key({ id }) {
    return `strategy-${id}`;
  },
  
  create(): StrategyMemory {
    const currentAgentId = getCurrentAgentId();
    
    return {
      agentId: currentAgentId,
      currentStrategy: null,
      alternativeIdeas: [
        {
          concept: "Resource cycling",
          hypothesis: "Rapidly cycling between different token pairs might create unexpected value generation paths",
          potentialBenefit: "Discovery of novel value creation loops"
        },
        {
          concept: "Threshold-based reactor switching",
          hypothesis: "Reactors might have different optimal deposit windows",
          potentialBenefit: "Maximizing reward generation through optimal timing"
        },
        {
          concept: "Resource accumulation bursts",
          hypothesis: "Concentrated periods of specific activities might yield better results than constant balanced activity",
          potentialBenefit: "Accelerating resource accumulation through focused effort periods"
        }
      ],
      marketObservations: {
        patterns: [],
        opportunities: [],
        resourceFlows: []
      },
      progressToGoal: {
        currentAmount: 0,
        targetAmount: 7000000,
        percentageComplete: 0,
      },
      insights: [],
      learnings: []
    };
  },
  
  render({ memory }: { memory: StrategyMemory }) {
    // Format the progress to goal with string conversion for numbers
    const progressPercentage = String(memory.progressToGoal.percentageComplete);
    const currentAmount = String(memory.progressToGoal.currentAmount);
    const targetAmount = String(memory.progressToGoal.targetAmount);
    
    // Format current strategy or placeholder
    let currentStrategyDisplay = "No strategy defined yet. Feel free to create a strategy based on your unique approach.";
    let actionSequence = "No actions defined. Define actions that align with your creative strategy.";
    
    if (memory.currentStrategy) {
      currentStrategyDisplay = `**${memory.currentStrategy.name}** (${memory.currentStrategy.type})
Goal: ${memory.currentStrategy.goal}
Timeframe: ${memory.currentStrategy.timeframe}
Risk Assessment: ${memory.currentStrategy.riskAssessment}`;

      if (memory.currentStrategy.experimentalAspects && memory.currentStrategy.experimentalAspects.length > 0) {
        currentStrategyDisplay += `\n\nExperimental Aspects:\n${memory.currentStrategy.experimentalAspects.map(aspect => `- ${aspect}`).join('\n')}`;
      }
      
      if (memory.currentStrategy.hypotheses && memory.currentStrategy.hypotheses.length > 0) {
        currentStrategyDisplay += `\n\nHypotheses to Test:\n${memory.currentStrategy.hypotheses.map(hypothesis => `- ${hypothesis}`).join('\n')}`;
      }
      
      // Format action sequence if available
      if (memory.currentStrategy.actions && memory.currentStrategy.actions.length > 0) {
        actionSequence = memory.currentStrategy.actions
          .sort((a, b) => b.priority - a.priority)
          .map(action => {
            let actionText = `${action.priority}. ${action.actionType}: ${action.description}\n   • Expected outcome: ${action.expectedOutcome}`;
            if (action.reasoning) {
              actionText += `\n   • Reasoning: ${action.reasoning}`;
            }
            if (action.blockchain_actions && action.blockchain_actions.length > 0) {
              actionText += `\n   • Blockchain actions: ${action.blockchain_actions.join(', ')}`;
            }
            return actionText;
          })
          .join('\n');
      }
    }
    
    // Format alternative ideas
    const alternativeIdeasText = memory.alternativeIdeas.length > 0
      ? memory.alternativeIdeas.map(idea => {
          return `- **${idea.concept}**\n` +
                 `  • Hypothesis: ${idea.hypothesis}\n` +
                 `  • Potential benefit: ${idea.potentialBenefit}`;
        }).join('\n')
      : "No alternative ideas recorded yet. Feel free to brainstorm creative approaches.";
    
    // Format market observations
    const patternsText = memory.marketObservations.patterns.length > 0
      ? memory.marketObservations.patterns.map(pattern => `- ${pattern}`).join('\n')
      : "No patterns observed yet";
    
    const opportunitiesText = memory.marketObservations.opportunities.length > 0
      ? memory.marketObservations.opportunities.map(opp => `- ${opp}`).join('\n')
      : "No opportunities identified yet";
    
    const resourceFlowsText = memory.marketObservations.resourceFlows.length > 0
      ? memory.marketObservations.resourceFlows.map(flow => `- ${flow}`).join('\n')
      : "No resource flows documented yet";
    
    // Format insights
    const insightsText = memory.insights.length > 0
      ? memory.insights.map(insight => {
          const date = new Date(insight.timestamp).toLocaleString();
          return `- **${date}**: ${insight.observation}\n` +
                 `  • Implications: ${insight.implications}`;
        }).join('\n')
      : "No insights recorded yet. Document your observations and what they might mean.";
    
    // Format learnings
    const learningsText = memory.learnings.length > 0
      ? memory.learnings.map(learning => {
          const date = new Date(learning.timestamp).toLocaleString();
          return `- **${date}**: ${learning.experiment}\n` +
                 `  • Result: ${learning.result}\n` +
                 `  • Adaptation: ${learning.adaptation}`;
        }).join('\n')
      : "No learnings recorded yet. Document your experiments, results, and adaptations.";
    
    return render(`
# Strategy Explorer

## Progress to Goal
Target: {{targetAmount}} He3
Current: {{currentAmount}} He3 ({{progressPercentage}}% complete)

## Current Strategy
{{currentStrategyDisplay}}

### Action Sequence
{{actionSequence}}

## Alternative Ideas to Explore
{{alternativeIdeas}}

## Market Observations
### Patterns
{{patterns}}

### Opportunities
{{opportunities}}

### Resource Flows
{{resourceFlows}}

## Insights & Reflections
{{insights}}

## Experimental Learnings
{{learnings}}

## Strategy Development Space
This is your space to develop innovative strategies. Some prompts to consider:

1. What unconventional combinations of resources or actions might yield interesting results?
2. Are there timing patterns that could be leveraged for advantage?
3. What experimental hypotheses would you like to test?
4. How might resource flows be optimized in unexpected ways?
5. What creative approaches to the goal haven't been tried yet?

Remember: The most effective strategies may not be the most obvious ones. You're encouraged to think creatively and experimentally.
`, {
      targetAmount: targetAmount,
      currentAmount: currentAmount,
      progressPercentage: progressPercentage,
      
      currentStrategyDisplay: currentStrategyDisplay,
      actionSequence: actionSequence,
      alternativeIdeas: alternativeIdeasText,
      
      patterns: patternsText,
      opportunities: opportunitiesText,
      resourceFlows: resourceFlowsText,
      
      insights: insightsText,
      learnings: learningsText
    });
  },
});

// Export the contexts
export const strategyContexts = [strategyContext]; 