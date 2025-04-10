//@ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiAssistant.css';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import * as DOM from '../../../../base/browser/dom.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IAIAssistantService, IAIResponse, ICodeModification } from '../../../../workbench/contrib/aiAssistant/common/aiAssistant.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { defaultButtonStyles, defaultInputBoxStyles } from '../../../../platform/theme/browser/defaultStyles.js';
import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AIAssistantService } from '../common/aiAssistantService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { ITextFileService } from '../../../../workbench/services/textfile/common/textfiles.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';

// 图标定义
export const aiAssistantIcon = registerIcon('ai-assistant', Codicon.sparkle, localize('aiAssistantIcon', 'Icon for AI Assistant'));

// AI助手面板类
export class AIAssistantPanel extends ViewPane {
	static readonly ID = 'workbench.view.aiAssistant.chat';

	private readonly disposables = new DisposableStore();
	private readonly aiAssistantService: IAIAssistantService;

	// UI元素
	private container!: HTMLElement;
	private responseContainer!: HTMLElement;
	private inputBox!: InputBox;
	private sendButton!: Button;
	private isProcessing = false;

	// 当前的代码修改列表
	private currentModifications: ICodeModification[] = [];

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IEditorService private readonly editorService: IEditorService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IStorageService storageService: IStorageService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IRequestService requestService: IRequestService,
		@ITextFileService textFileService: ITextFileService,
		@ITextModelService textModelService: ITextModelService,
		@IHoverService hoverService: IHoverService
	) {
		// 明确指定视图容器ID，确保与注册的视图容器匹配
		super({
			...options,
			id: AIAssistantPanel.ID,
			title: localize('aiAssistant.view.title', 'AI 助手'),
			icon: aiAssistantIcon,
			viewContainerId: 'workbench.view.aiAssistant', // 明确指定视图容器ID
			canToggleVisibility: true,
			canMoveView: true,
			focusCommand: { id: 'workbench.action.focusAIAssistant' }
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, storageService, hoverService);

		// 获取AI助手服务实例
		this.aiAssistantService = AIAssistantService.getInstance(
			storageService,
			workspaceContextService,
			logService,
			configurationService,
			environmentService,
			requestService,
			textFileService,
			textModelService
		);

		// 订阅AI服务事件
		this.disposables.add(
			this.aiAssistantService.onDidReceiveResponse(response => this.handleResponse(response))
		);
		this.disposables.add(
			this.aiAssistantService.onDidStartRequest(() => this.setProcessingState(true))
		);
	}

	// 创建视图
	protected override renderBody(container: HTMLElement): void {
		if (!container) {
			this.logService.error('Container element is undefined in renderBody');
			return;
		}

		try {
			// 在调用父类方法前确保容器存在
			this.container = container; // 先设置容器引用
			super.renderBody(container);

			// 确保样式类添加
			this.container.classList.add('ai-assistant-container');

			// 创建响应容器 - 在创建输入区之前
			this.responseContainer = DOM.$('.ai-assistant-response');
			container.appendChild(this.responseContainer);

			// 创建输入部分
			this.createInputSection(container);

			// 显示欢迎信息
			this.showWelcomeMessage();
		} catch (error) {
			this.logService.error('Error rendering AI Assistant panel body', error);
			container.innerHTML = '<div class="ai-assistant-error">渲染AI助手时出错</div>';
		}
	}

	// 创建输入部分
	private createInputSection(container: HTMLElement): void {
		const inputSection = DOM.$('.ai-assistant-input-section');

		// 创建输入框
		const inputContainer = DOM.$('.ai-assistant-input-container');
		this.inputBox = new InputBox(inputContainer, undefined, {
			...defaultInputBoxStyles,
			inputBackground: undefined,
			inputForeground: undefined,
			inputBorder: undefined
		});

		this.inputBox.setPlaceHolder(localize('aiAssistant.inputPlaceholder', '向AI助手提问...'));
		this.disposables.add(this.inputBox);
		this.disposables.add(this.inputBox.onDidChange(() => this.updateSendButtonState()));

		// 创建发送按钮
		const buttonContainer = DOM.$('.ai-assistant-button-container');
		this.sendButton = new Button(buttonContainer, { ...defaultButtonStyles });
		this.sendButton.enabled = false;
		this.sendButton.label = localize('aiAssistant.send', '发送');
		this.disposables.add(this.sendButton);
		this.disposables.add(this.sendButton.onDidClick(() => this.sendRequest()));

		// 监听回车键
		this.inputBox.onKeyUp(e => {
			if (e.equals(3 /* Enter */) && !this.isProcessing && this.inputBox.value.trim().length > 0) {
				this.sendRequest();
			}
		});

		// 将输入部分添加到容器
		inputSection.appendChild(inputContainer);
		inputSection.appendChild(buttonContainer);
		container.appendChild(inputSection);
	}

	// 更新发送按钮状态
	private updateSendButtonState(): void {
		this.sendButton.enabled = !this.isProcessing && this.inputBox.value.trim().length > 0;
	}

	// 设置处理状态
	private setProcessingState(processing: boolean): void {
		this.isProcessing = processing;
		this.updateSendButtonState();

		if (processing) {
			// 添加加载指示器
			const loadingElement = DOM.$('.ai-assistant-loading');
			loadingElement.textContent = localize('aiAssistant.thinking', '思考中...');
			this.responseContainer.appendChild(loadingElement);
		} else {
			// 移除加载指示器
			const loadingElement = this.responseContainer.querySelector('.ai-assistant-loading');
			if (loadingElement) {
				loadingElement.remove();
			}
		}
	}

	// 发送请求
	private async sendRequest(): Promise<void> {
		const prompt = this.inputBox.value.trim();
		if (!prompt || this.isProcessing) {
			return;
		}

		// 清空当前修改列表
		this.currentModifications = [];

		// 显示用户输入
		this.appendUserMessage(prompt);

		// 清空输入框
		this.inputBox.value = '';

		// 获取当前编辑器上下文
		let codeContext = '';
		let filePath = '';

		const activeEditor = this.editorService.activeTextEditorControl;
		if (activeEditor && 'getModel' in activeEditor) {
			const model = activeEditor.getModel() as ITextModel;
			if (model) {
				const selection = (activeEditor as ICodeEditor).getSelection();
				if (selection && !selection.isEmpty()) {
					codeContext = model.getValueInRange(selection);
				}

				// 获取文件路径
				if (model.uri) {
					filePath = model.uri.fsPath;
				}
			}
		}

		// 发送到AI服务
		try {
			await this.aiAssistantService.ask({
				prompt,
				codeContext,
				filePath
			});
		} catch (error) {
			this.logService.error('Error sending request to AI:', error);
			this.appendErrorMessage('发送请求时出错，请稍后再试。');
			this.setProcessingState(false);
		}
	}

	// 处理AI响应
	private handleResponse(response: IAIResponse): void {
		this.setProcessingState(false);

		if (response.isError) {
			this.appendErrorMessage(response.content);
			return;
		}

		// 显示响应内容
		this.appendAIMessage(response.content);

		// 处理代码修改建议
		if (response.codeModifications && response.codeModifications.length > 0) {
			this.currentModifications = response.codeModifications;
			this.appendCodeModifications(response.codeModifications);
		}
	}

	// 附加用户消息
	private appendUserMessage(message: string): void {
		const messageElement = DOM.$('.ai-assistant-message.user-message');
		const contentElement = DOM.$('.ai-assistant-message-content');
		contentElement.textContent = message;

		const headerElement = DOM.$('.ai-assistant-message-header');
		headerElement.textContent = localize('aiAssistant.you', '你');

		messageElement.appendChild(headerElement);
		messageElement.appendChild(contentElement);
		this.responseContainer.appendChild(messageElement);

		// 滚动到底部
		this.responseContainer.scrollTop = this.responseContainer.scrollHeight;
	}

	// 附加AI消息
	private appendAIMessage(message: string): void {
		const messageElement = DOM.$('.ai-assistant-message.ai-message');
		const contentElement = DOM.$('.ai-assistant-message-content');

		// 使用Markdown渲染器渲染内容
		const renderedMarkdown = renderMarkdown({
			value: message,
			supportHtml: true,
			linkify: true
		}, {
			codeBlockRenderer: (languageId, value) => {
				// 代码块渲染器
				return `<pre class="code-block"><code class="language-${languageId}">${value}</code></pre>`;
			},
			actionHandler: {
				callback: (content) => {
					this.openerService.open(content).catch(err => {
						this.logService.error('Error opening link:', err);
					});
					return true;
				},
				disposables: this.disposables
			}
		});

		contentElement.appendChild(renderedMarkdown.element);

		const headerElement = DOM.$('.ai-assistant-message-header');
		headerElement.textContent = localize('aiAssistant.ai', 'AI助手');

		messageElement.appendChild(headerElement);
		messageElement.appendChild(contentElement);
		this.responseContainer.appendChild(messageElement);

		// 滚动到底部
		this.responseContainer.scrollTop = this.responseContainer.scrollHeight;
	}

	// 附加错误消息
	private appendErrorMessage(message: string): void {
		const messageElement = DOM.$('.ai-assistant-message.error-message');
		const contentElement = DOM.$('.ai-assistant-message-content');
		contentElement.textContent = message;

		const headerElement = DOM.$('.ai-assistant-message-header');
		headerElement.textContent = localize('aiAssistant.error', '错误');

		messageElement.appendChild(headerElement);
		messageElement.appendChild(contentElement);
		this.responseContainer.appendChild(messageElement);

		// 滚动到底部
		this.responseContainer.scrollTop = this.responseContainer.scrollHeight;
	}

	// 附加代码修改建议
	private appendCodeModifications(modifications: ICodeModification[]): void {
		// 创建代码修改建议容器
		const modificationsContainer = DOM.$('.ai-assistant-modifications');

		// 添加标题
		const titleElement = DOM.$('.ai-assistant-modifications-title');
		titleElement.textContent = localize('aiAssistant.suggestions', '代码修改建议');
		modificationsContainer.appendChild(titleElement);

		// 为每个修改建议创建UI
		for (const modification of modifications) {
			const modElement = DOM.$('.ai-assistant-modification');

			// 添加描述
			const descElement = DOM.$('.ai-assistant-modification-description');
			descElement.textContent = modification.description;
			modElement.appendChild(descElement);

			// 添加代码比较
			const diffElement = DOM.$('.ai-assistant-modification-diff');

			// 原始代码
			const originalElement = DOM.$('.ai-assistant-modification-code.original');
			const originalTitle = DOM.$('.ai-assistant-modification-code-title');
			originalTitle.textContent = localize('aiAssistant.original', '原始代码');
			const originalCode = DOM.$('.ai-assistant-modification-code-content');
			originalCode.textContent = modification.originalCode;
			originalElement.appendChild(originalTitle);
			originalElement.appendChild(originalCode);

			// 修改后代码
			const modifiedElement = DOM.$('.ai-assistant-modification-code.modified');
			const modifiedTitle = DOM.$('.ai-assistant-modification-code-title');
			modifiedTitle.textContent = localize('aiAssistant.modified', '修改后代码');
			const modifiedCode = DOM.$('.ai-assistant-modification-code-content');
			modifiedCode.textContent = modification.modifiedCode;
			modifiedElement.appendChild(modifiedTitle);
			modifiedElement.appendChild(modifiedCode);

			diffElement.appendChild(originalElement);
			diffElement.appendChild(modifiedElement);
			modElement.appendChild(diffElement);

			// 添加操作按钮
			const actionsElement = DOM.$('.ai-assistant-modification-actions');

			// 应用修改按钮
			const applyButton = new Button(actionsElement, { ...defaultButtonStyles });
			applyButton.label = localize('aiAssistant.apply', '应用');
			this.disposables.add(applyButton);
			this.disposables.add(applyButton.onDidClick(() => this.applyModification(modification)));

			// 拒绝修改按钮
			const rejectButton = new Button(actionsElement, { ...defaultButtonStyles, secondary: true });
			rejectButton.label = localize('aiAssistant.reject', '拒绝');
			this.disposables.add(rejectButton);
			this.disposables.add(rejectButton.onDidClick(() => this.rejectModification(modification.id)));

			modElement.appendChild(actionsElement);
			modificationsContainer.appendChild(modElement);
		}

		this.responseContainer.appendChild(modificationsContainer);

		// 滚动到底部
		this.responseContainer.scrollTop = this.responseContainer.scrollHeight;
	}

	// 应用代码修改
	private async applyModification(modification: ICodeModification): Promise<void> {
		try {
			const success = await this.aiAssistantService.applyCodeModification(modification);

			if (success) {
				// 在UI中标记为已应用
				const modElement = this.getModificationElement(modification.id);
				if (modElement) {
					modElement.classList.add('applied');

					// 更新按钮
					const actionsElement = modElement.querySelector('.ai-assistant-modification-actions');
					if (actionsElement) {
						// 清空原有按钮
						DOM.clearNode(actionsElement);

						// 添加应用成功信息
						const appliedInfo = DOM.$('.ai-assistant-modification-applied');
						appliedInfo.textContent = localize('aiAssistant.applied', '已应用');
						actionsElement.appendChild(appliedInfo);
					}
				}

				// 显示成功消息
				this.appendAIMessage('✅ 代码修改已成功应用。');
			} else {
				this.appendErrorMessage('应用代码修改失败，请检查文件是否存在或有权限修改。');
			}
		} catch (error) {
			this.logService.error('Error applying modification:', error);
			this.appendErrorMessage('应用代码修改时出错：' + (error.message || '未知错误'));
		}
	}

	// 拒绝代码修改
	private rejectModification(modificationId: string): void {
		// 在UI中标记为已拒绝
		const modElement = this.getModificationElement(modificationId);
		if (modElement) {
			modElement.classList.add('rejected');

			// 更新按钮
			const actionsElement = modElement.querySelector('.ai-assistant-modification-actions');
			if (actionsElement) {
				// 清空原有按钮
				DOM.clearNode(actionsElement);

				// 添加拒绝信息
				const rejectedInfo = DOM.$('.ai-assistant-modification-rejected');
				rejectedInfo.textContent = localize('aiAssistant.rejected', '已拒绝');
				actionsElement.appendChild(rejectedInfo);
			}
		}
	}

	// 获取修改建议元素
	private getModificationElement(modificationId: string): HTMLElement | null {
		const modElements = this.responseContainer.querySelectorAll('.ai-assistant-modification');
		for (let i = 0; i < modElements.length; i++) {
			const index = Array.from(modElements).indexOf(modElements[i]);
			if (index >= 0 && index < this.currentModifications.length && this.currentModifications[index].id === modificationId) {
				return modElements[i] as HTMLElement;
			}
		}
		return null;
	}

	// 显示欢迎消息
	private showWelcomeMessage(): void {
		const welcomeMessage = `欢迎使用AI助手！

我可以帮助你：
- 分析和解释代码
- 提供代码重构建议
- 生成示例代码
- 回答编程相关的问题

请在输入框中输入你的问题，或者在编辑器中选择代码后使用右键菜单中的"请AI分析选中代码"命令。`;

		this.appendAIMessage(welcomeMessage);
	}

	// 清空面板
	public clear(): void {
		DOM.clearNode(this.responseContainer);
		this.currentModifications = [];
	}

	override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}

	override layout(dimension: DOM.Dimension | undefined): void {
		// 更全面的防御性检查
		if (!this.element) {
			this.logService.warn('Element is undefined in layout');
			return;
		}

		if (!document.body.contains(this.element)) {
			this.logService.warn('Element is not attached to DOM in layout');
			return;
		}

		try {
			// 先确保基本元素已初始化
			if (!this.container) {
				this.logService.warn('Container not initialized in layout');
				return;
			}

			// 调用父类的layout方法
			super.layout(dimension);

			// 调整内部元素布局
			if (dimension && this.responseContainer) {
				// 调整响应容器高度，预留输入区域空间
				const inputSectionHeight = this.element.querySelector('.ai-assistant-input-section')?.clientHeight || 50;
				const responseHeight = dimension.height - inputSectionHeight - 10; // 10px为边距
				this.responseContainer.style.height = `${Math.max(50, responseHeight)}px`;
			}
		} catch (error) {
			this.logService.error('Error in AI Assistant panel layout:', error);
		}
	}

	// 添加更严格的初始化检查
	override setVisible(visible: boolean): void {
		try {
			super.setVisible(visible);

			// 在显示时进行额外检查，确保所有必要元素都已初始化
			if (visible && this.element) {
				if (!this.container || !this.responseContainer) {
					// 如果关键元素未初始化，尝试重新渲染
					this.logService.warn('Key elements not initialized, attempting to re-render');
					this.render();
				}
			}
		} catch (error) {
			this.logService.error('Error in setVisible', error);
		}
	}

	// 扩展初始化代码，确保实例状态的一致性
	override render(): void {
		if (!this.element) {
			this.logService.warn('Element is undefined in render');
			return;
		}

		try {
			// 设置初始错误处理器
			const errorElement = DOM.$('.ai-assistant-error');
			errorElement.textContent = '正在加载AI助手...';
			this.element.appendChild(errorElement);

			// 调用父类的render方法
			super.render();

			// 如果渲染成功，移除错误元素
			if (errorElement.parentElement) {
				errorElement.parentElement.removeChild(errorElement);
			}

			// 验证面板是否正确初始化
			if (!this.container || !this.responseContainer) {
				throw new Error('AI Assistant panel not properly initialized');
			}
		} catch (error) {
			this.logService.error('Failed to render AI Assistant panel:', error);

			// 确保错误信息显示
			try {
				if (this.element) {
					DOM.clearNode(this.element);
					const errorElement = DOM.$('.ai-assistant-error');
					errorElement.textContent = '加载AI助手时出错';
					this.element.appendChild(errorElement);
				}
			} catch (e) {
				this.logService.error('Failed to show error message:', e);
			}
		}
	}

	// 添加额外的健壮性检查方法
	private ensureInitialized(): boolean {
		if (!this.element || !this.container || !this.responseContainer) {
			this.logService.warn('AI Assistant panel not fully initialized');
			return false;
		}
		return true;
	}

	getId(): string {
		return 'aiAssistant.chat';
	}
}
