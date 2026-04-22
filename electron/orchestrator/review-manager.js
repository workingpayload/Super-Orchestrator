/**
 * ReviewManager — handles the review workflow.
 * Sends completed task outputs to a Reviewer agent and processes feedback.
 */
class ReviewManager {
  constructor() {
    this.maxRevisionRounds = 3;
  }

  /**
   * Build the review meta-prompt for the Reviewer agent.
   * @param {object[]} tasks - Completed tasks with outputs
   * @param {string} originalPrompt - The original user prompt
   * @returns {string} Review prompt
   */
  buildReviewPrompt(tasks, originalPrompt) {
    const taskSummaries = tasks.map(t => {
      return `--- TASK ${t.id}: ${t.title} ---
STATUS: ${t.status}
PROMPT: ${t.prompt}
OUTPUT:
${t.output || '(no output)'}
${t.error ? `ERROR: ${t.error}` : ''}
---`;
    }).join('\n\n');

    return `You are a Code Reviewer agent. Your job is to review the work completed by worker agents against the original request.

IMPORTANT: You MUST respond with ONLY valid JSON, no markdown fences, no explanation text before or after the JSON.

ORIGINAL USER REQUEST:
${originalPrompt}

COMPLETED WORK:
${taskSummaries}

Please review each task and evaluate:
1. Does the output correctly address the task prompt?
2. Is the quality of work acceptable?
3. Are there any issues, bugs, or improvements needed?

Respond with EXACTLY this JSON format:
{
  "overall_status": "approved" or "revisions_needed",
  "overall_feedback": "General feedback about the work",
  "tasks": [
    {
      "id": 1,
      "status": "approved" or "revision_needed",
      "quality_score": 8,
      "feedback": "Specific feedback for this task",
      "suggestion": "If revision needed, what specifically should change"
    }
  ]
}

Remember: Output ONLY the JSON object. No markdown code fences. No explanatory text.`;
  }

  /**
   * Parse the Reviewer agent's response.
   * @param {string} rawOutput - Raw output from the Reviewer agent
   * @returns {object} Parsed review result
   */
  parseReviewResult(rawOutput) {
    let data;

    // Strip markdown code fences
    let cleaned = rawOutput
      .replace(/```(?:json)?\s*\n?/g, '')
      .replace(/```\s*$/g, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        data = JSON.parse(jsonMatch[0]);
      } catch (e) {
        let sanitized = jsonMatch[0]
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']');
        try {
          data = JSON.parse(sanitized);
        } catch (e2) {
          // If JSON parsing fails, treat everything as approved
          return {
            overall_status: 'approved',
            overall_feedback: 'Review completed (output could not be parsed as structured feedback)',
            raw_feedback: rawOutput,
            tasks: [],
          };
        }
      }
    } else {
      return {
        overall_status: 'approved',
        overall_feedback: rawOutput,
        raw_feedback: rawOutput,
        tasks: [],
      };
    }

    return {
      overall_status: data.overall_status || 'approved',
      overall_feedback: data.overall_feedback || '',
      tasks: (data.tasks || []).map(t => ({
        id: t.id,
        status: t.status || 'approved',
        quality_score: t.quality_score || null,
        feedback: t.feedback || '',
        suggestion: t.suggestion || '',
      })),
    };
  }

  /**
   * Apply review results to tasks.
   * @param {object[]} tasks - The tasks to update
   * @param {object} reviewResult - Parsed review result
   * @returns {object[]} Updated tasks
   */
  applyReviewToTasks(tasks, reviewResult) {
    for (const task of tasks) {
      const reviewTask = reviewResult.tasks.find(r => r.id === task.id);
      if (reviewTask) {
        task.reviewStatus = reviewTask.status;
        task.reviewFeedback = reviewTask.feedback;
        task.reviewSuggestion = reviewTask.suggestion;
        task.qualityScore = reviewTask.quality_score;
      } else {
        // If not mentioned in review, assume approved
        task.reviewStatus = 'approved';
      }
    }
    return tasks;
  }

  /**
   * Get tasks that need revision.
   */
  getTasksNeedingRevision(tasks) {
    return tasks.filter(t => t.reviewStatus === 'revision_needed');
  }
}

module.exports = { ReviewManager };
