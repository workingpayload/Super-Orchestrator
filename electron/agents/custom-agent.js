const { BaseAgent } = require('./base-agent');

/**
 * CustomAgent — adapter for user-defined CLI tools.
 * Allows users to specify any CLI command with a prompt template.
 */
class CustomAgent extends BaseAgent {
  constructor(config) {
    super({ ...config, type: 'custom' });
    this.cliPath = config.cliPath || '';
    this.promptFlag = config.promptFlag || '-p'; // Flag to pass prompt
    this.promptTemplate = config.promptTemplate || '{prompt}'; // Template for prompt
  }

  buildCommand(prompt, options = {}) {
    const formattedPrompt = this.promptTemplate.replace('{prompt}', prompt);
    const args = [this.promptFlag, formattedPrompt];

    // Add any extra flags
    args.push(...this.extraFlags);

    return args;
  }
}

module.exports = { CustomAgent };
