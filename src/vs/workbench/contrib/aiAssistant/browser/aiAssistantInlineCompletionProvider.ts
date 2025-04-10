//@ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { InlineCompletionsProvider, InlineCompletion, InlineCompletionContext, ProviderResult } from '../../../../editor/common/languages.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAIAssistantService } from '../../../../workbench/contrib/aiAssistant/common/aiAssistant.js';

/**
 * AI助手内联补全提供者
 * 实现光标预测和代码续写功能
 */
export class AIAssistantInlineCompletionProvider implements InlineCompletionsProvider {

	private readonly disposables = new DisposableStore();

	// 是否启用内联补全
	private get enabled(): boolean {
		return this.configurationService.getValue<boolean>('aiAssistant.inlineCompletion.enabled') ?? true;
	}

	constructor(
		@IAIAssistantService private readonly aiAssistantService: IAIAssistantService,
		@IModelService private readonly modelService: IModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService
	) { }

	/**
	 * 提供内联补全建议
	 */
	async provideInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): Promise<ProviderResult<InlineCompletion[]>> {
		if (!this.enabled) {
			return { items: [] };
		}

		// 获取当前文档上下文
		const documentContext = this.getDocumentContext(model, position);

		try {
			// 获取AI建议
			const completion = await this.aiAssistantService.getCodeCompletion(
				documentContext,
				{ line: position.lineNumber, column: position.column }
			);

			if (!completion || token.isCancellationRequested) {
				return { items: [] };
			}

			// 创建内联补全项
			return {
				items: [{
					insertText: completion,
					range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
					command: {
						id: 'editor.action.inlineSuggest.commit',
						title: '应用建议'
					}
				}]
			};
		} catch (error) {
			this.logService.error('Error providing inline completions:', error);
			return { items: [] };
		}
	}

	/**
	 * 获取文档上下文，用于分析补全建议
	 */
	private getDocumentContext(model: ITextModel, position: Position): string {
		// 获取前面的N行作为上下文
		const lineCount = model.getLineCount();
		const contextStartLine = Math.max(1, position.lineNumber - 10);

		// 获取到当前位置的文本
		const preText = model.getValueInRange(new Range(contextStartLine, 1, position.lineNumber, position.column));

		// 获取当前行剩余文本作为后续上下文
		const currentLine = model.getLineContent(position.lineNumber);
		const postText = currentLine.substring(position.column - 1);

		// 返回完整上下文
		return preText + postText;
	}

	/**
	 * 自由文本编辑补全
	 */
	freeInlineCompletions(model: ITextModel, position: Position, context: InlineCompletionContext, token: CancellationToken): ProviderResult<InlineCompletion[]> {
		return this.provideInlineCompletions(model, position, context, token);
	}

	/**
	 * 处理用户补全命令
	 */
	handleItemDidShow(_completions: InlineCompletion[]): void {
		// 用户看到了建议，可以在这里添加遥测记录等
	}

	/**
	 * 释放资源
	 */
	dispose(): void {
		this.disposables.dispose();
	}
}
