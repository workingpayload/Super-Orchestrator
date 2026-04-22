/**
 * TaskDecomposer — wraps user prompts in meta-prompts to instruct
 * the Master agent to break work into structured subtasks.
 */
class TaskDecomposer {
  /**
   * Build the meta-prompt that instructs the Master agent to decompose a user prompt.
   * @param {string} userPrompt - The original user prompt
   * @param {number} workerCount - Number of available workers
   * @returns {string} The meta-prompt for the Master agent
   */
  buildDecompositionPrompt(userPrompt, workerCount = 2) {
    return `You are a Master Orchestrator agent. Your job is to analyze the following user request and break it down into smaller, well-defined tasks that can be executed by ${workerCount} worker agent(s).

IMPORTANT: You MUST respond with ONLY valid JSON, no markdown fences, no explanation text before or after the JSON.

Each task should:
1. Have a clear, specific objective
2. Include a detailed prompt that a coding AI agent can execute independently
3. Specify priority (high, medium, low)
4. List dependencies on other task IDs (if any)

Respond with EXACTLY this JSON format:
{
  "refined_prompt": "A refined, clearer version of the user's request",
  "summary": "Brief summary of the overall plan",
  "tasks": [
    {
      "id": 1,
      "title": "Short descriptive title",
      "description": "What this task accomplishes",
      "prompt": "The detailed prompt to send to the worker agent. Be specific and include all context needed.",
      "priority": "high",
      "dependencies": [],
      "estimated_complexity": "simple|moderate|complex"
    }
  ]
}

USER REQUEST:
${userPrompt}

Remember: Output ONLY the JSON object. No markdown code fences. No explanatory text.`;
  }

  /**
   * Parse the Master agent's response into structured tasks.
   * @param {string} rawOutput - Raw output from the Master agent
   * @returns {object} Parsed task decomposition
   */
  parseDecomposition(rawOutput) {
    let data;

    // Strip markdown code fences that LLMs often wrap around JSON
    let cleaned = rawOutput
      .replace(/```(?:json)?\s*\n?/g, '')
      .replace(/```\s*$/g, '')
      .trim();

    // Try to extract JSON from the output
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        data = JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Try cleaning common JSON issues (trailing commas, etc.)
        let sanitized = jsonMatch[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        try {
          data = JSON.parse(sanitized);
        } catch (e2) {
          throw new Error(`Failed to parse Master agent output as JSON: ${e2.message}\n\nRaw output (first 500 chars):\n${rawOutput.substring(0, 500)}`);
        }
      }
    } else {
      throw new Error(`Master agent output does not contain valid JSON.\n\nRaw output (first 500 chars):\n${rawOutput.substring(0, 500)}`);
    }

    // Validate structure
    if (!data.tasks || !Array.isArray(data.tasks)) {
      throw new Error('Master agent output missing "tasks" array');
    }

    // Normalize tasks
    const tasks = data.tasks.map((task, index) => ({
      id: task.id || index + 1,
      title: task.title || `Task ${index + 1}`,
      description: task.description || '',
      prompt: task.prompt || task.description || '',
      priority: task.priority || 'medium',
      dependencies: task.dependencies || [],
      estimated_complexity: task.estimated_complexity || 'moderate',
      status: 'queued',
      assignedAgent: null,
      output: '',
      error: null,
      reviewStatus: null,
      reviewFeedback: null,
      startTime: null,
      endTime: null,
    }));

    return {
      refined_prompt: data.refined_prompt || data.summary || '',
      summary: data.summary || '',
      tasks,
    };
  }

  /**
   * Build a revision prompt for a task that needs rework.
   * @param {object} task - The original task
   * @param {string} feedback - Reviewer feedback
   * @returns {string} Revised prompt
   */
  buildRevisionPrompt(task, feedback) {
    return `You previously worked on this task but it needs revisions.

ORIGINAL TASK: ${task.title}
ORIGINAL PROMPT: ${task.prompt}

YOUR PREVIOUS OUTPUT:
${task.output}

REVIEWER FEEDBACK:
${feedback}

Please address the reviewer's feedback and provide an improved solution. Focus specifically on the issues mentioned.`;
  }
}

module.exports = { TaskDecomposer };
