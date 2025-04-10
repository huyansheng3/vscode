//@ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IViewContainersRegistry, ViewContainerLocation, Extensions as ViewExtensions, IViewsRegistry, IViewDescriptorService } from '../../../../workbench/common/views.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { ServicesAccessor, IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { Schemas } from '../../../../base/common/network.js';
import { IAIAssistantService, IAIRequest } from '../common/aiAssistant.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { AIAssistantInlineCompletionProvider } from './aiAssistantInlineCompletionProvider.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { IEditorContributionDescription } from '../../../../editor/common/editorContributionDescription.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { AIAssistantService } from '../common/aiAssistantService.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { Orientation } from '../../../../base/browser/ui/sash/sash.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import "./media/aiAssistant.css"

// 容器ID
export const AI_ASSISTANT_VIEW_CONTAINER_ID = 'workbench.view.aiAssistant';
export const AI_ASSISTANT_PANEL_ID = 'workbench.view.aiAssistant.chat';

// 定义图标
export const aiAssistantIcon = registerIcon('ai-assistant-icon', Codicon.sparkle, localize('aiAssistantIcon', '用于AI助手视图的图标'));

// 定义 AIAssistantPanel 类
export class AIAssistantPanel extends ViewPane {
	static readonly ID = AI_ASSISTANT_PANEL_ID;

	private container: HTMLElement | undefined;
	private inputContainer: HTMLElement | undefined;
	private messageContainer: HTMLElement | undefined;
	private input: HTMLTextAreaElement | undefined;

	constructor(
		options: any,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IAIAssistantService private readonly aiAssistantService: IAIAssistantService,
		@ILogService private readonly logService: ILogService
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);

		this.logService.info(`AI Assistant Panel initialized with ID: ${AIAssistantPanel.ID}`);
	}

	protected override renderHeaderTitle(container: HTMLElement, title: string): void {
		try {
			const titleElement = DOM.append(container, DOM.$('h3.title', undefined, title));

			// 添加标题图标
			const iconElement = DOM.append(titleElement, DOM.$('span.title-icon'));
			// iconElement.classList.add(...aiAssistantIcon.classNamesArray);

			// 不调用 setupManagedHover 方法，直接使用传统的 title 属性
			titleElement.title = title;

			this.logService.debug('AI Assistant Panel header title rendered successfully');
		} catch (error) {
			this.logService.error('Error rendering AI Assistant panel header title', error);
		}
	}

	override renderBody(parent: HTMLElement): void {
		try {
			super.renderBody(parent);

			this.container = DOM.append(parent, DOM.$('.ai-assistant-container'));
			this.container.classList.add('ai-assistant-panel');

			// 消息显示区域
			this.messageContainer = DOM.append(this.container, DOM.$('.ai-assistant-messages'));

			// 底部输入区域
			this.inputContainer = DOM.append(this.container, DOM.$('.ai-assistant-input-container'));

			// 输入框
			this.input = DOM.append(this.inputContainer, DOM.$('textarea.ai-assistant-input')) as HTMLTextAreaElement;
			this.input.placeholder = localize('aiAssistant.inputPlaceholder', '向 AI 助手提问...');
			this.input.rows = 3;

			// 发送按钮
			const sendButton = DOM.append(this.inputContainer, DOM.$('button.ai-assistant-send-button'));
			sendButton.textContent = localize('aiAssistant.send', '发送');

			// 绑定事件
			this._register(DOM.addDisposableListener(sendButton, DOM.EventType.CLICK, () => this.sendMessage()));
			this._register(DOM.addDisposableListener(this.input, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					this.sendMessage();
				}
			}));

			// 初始欢迎消息
			this.addMessage('AI 助手', localize('aiAssistant.welcome', '你好！我是你的 AI 助手。有什么可以帮助你的吗？'), 'assistant');
		} catch (error) {
			this.logService.error('Error rendering AI Assistant panel', error);
			// 显示简单的错误提示
			parent.innerHTML = '<div class="ai-assistant-error">加载 AI 助手面板时出错</div>';
		}
	}

	private sendMessage(): void {
		if (!this.input || !this.input.value.trim()) {
			return;
		}

		const userMessage = this.input.value.trim();
		this.addMessage('你', userMessage, 'user');
		this.input.value = '';

		// 显示加载状态
		const loadingId = this.addMessage('AI 助手', localize('aiAssistant.thinking', '思考中...'), 'assistant loading');

		// 发送到服务
		const request: IAIRequest = {
			prompt: userMessage,
			codeContext: null,
			filePath: null
		};

		this.aiAssistantService.ask(request).then(response => {
			// 移除加载消息
			this.updateMessage(loadingId, 'AI 助手', response.content, 'assistant');
		}).catch(error => {
			// 显示错误
			this.updateMessage(loadingId, 'AI 助手', localize('aiAssistant.error', '抱歉，发生错误：{0}', error.message), 'assistant error');
		});
	}

	private addMessage(sender: string, content: string, className: string): string {
		if (!this.messageContainer) {
			return '';
		}

		const id = `message-${Date.now()}`;
		const messageElem = DOM.append(this.messageContainer, DOM.$(`div.ai-assistant-message.${className}`));
		messageElem.id = id;

		const senderElem = DOM.append(messageElem, DOM.$('div.ai-assistant-sender'));
		senderElem.textContent = sender;

		const contentElem = DOM.append(messageElem, DOM.$('div.ai-assistant-content'));

		// 加载动画的特殊处理
		if (className.includes('loading')) {
			const typingIndicator = DOM.append(contentElem, DOM.$('div.ai-assistant-typing'));
			DOM.append(typingIndicator, DOM.$('span'));
			DOM.append(typingIndicator, DOM.$('span'));
			DOM.append(typingIndicator, DOM.$('span'));
		} else {
			// 使用安全的方式添加内容
			this.appendFormattedContent(contentElem, content);
		}

		// 添加时间戳
		const timestamp = DOM.append(messageElem, DOM.$('div.ai-assistant-timestamp'));
		const now = new Date();
		timestamp.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

		// 滚动到底部
		this.messageContainer.scrollTop = this.messageContainer.scrollHeight;

		return id;
	}

	private updateMessage(id: string, sender: string, content: string, className: string): void {
		const messageElem = document.getElementById(id);
		if (!messageElem) {
			return;
		}

		// 更新类名
		messageElem.className = `ai-assistant-message ${className}`;

		// 更新内容
		const contentElem = messageElem.querySelector('.ai-assistant-content');
		if (contentElem) {
			// 清空原有内容
			while (contentElem.firstChild) {
				contentElem.removeChild(contentElem.firstChild);
			}

			// 处理普通文本和代码块
			this.appendFormattedContent(contentElem, content);
		}

		// 滚动到底部
		if (this.messageContainer) {
			this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
		}
	}

	// 使用 DOM API 安全地添加格式化内容
	private appendFormattedContent(container: HTMLElement, content: string): void {
		// 使用正则表达式匹配代码块
		const segments = content.split(/(```[\s\S]*?```)/g);

		for (const segment of segments) {
			if (segment.startsWith('```') && segment.endsWith('```')) {
				// 处理代码块
				const code = segment.substring(3, segment.length - 3).trim();

				// 创建代码块容器
				const preElement = document.createElement('pre');
				const codeElement = document.createElement('code');
				preElement.appendChild(codeElement);

				// 设置代码内容为纯文本
				codeElement.textContent = code;

				// 添加到容器
				container.appendChild(preElement);
			} else if (segment.trim()) {
				// 处理普通文本
				const textNode = document.createTextNode(segment);
				container.appendChild(textNode);
			}
		}
	}

	protected override layoutBody(height: number, width: number): void {
		try {
			super.layoutBody(height, width);

			if (this.container) {
				this.container.style.height = `${height}px`;
				this.container.style.width = `${width}px`;
			}
		} catch (error) {
			this.logService.error('Error in AIAssistantPanel layoutBody', error);
		}
	}
}

// 定义 AIAssistant 服务接口
export interface IAIAssistantService {
	ask(request: IAIRequest): Promise<IAIResponse>;
}

// 定义请求和响应接口
export interface IAIRequest {
	prompt: string;
	codeContext: string | null;
	filePath: string | null;
}

export interface IAIResponse {
	content: string;
	codeChanges?: IAICodeChanges;
}

export interface IAICodeChanges {
	original: string;
	modified: string;
	filePath?: string;
}

// 创建安全的视图容器类
class SafeViewPaneContainer extends ViewPaneContainer {
	constructor(
		id: string,
		viewPaneContainerOptions: any,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionService extensionService: IExtensionService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService private readonly logService: ILogService
	) {
		super(id, viewPaneContainerOptions, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextKeyService, viewDescriptorService);

		this.logService.info(`SafeViewPaneContainer initialized with ID: ${id}`);
	}

	// 重写方法添加防错处理
	override restoreViewSizes(): void {
		try {
			// 防御性检查：确保视图容器模型和视图描述符存在
			if (!this.viewContainerModel || !this.viewContainerModel.visibleViewDescriptors) {
				this.logService.warn('View container model or visible view descriptors not available');
				return;
			}

			// 确保所有视图描述符都有id
			const validDescriptors = this.viewContainerModel.visibleViewDescriptors.filter(d => d && d.id);
			if (validDescriptors.length !== this.viewContainerModel.visibleViewDescriptors.length) {
				this.logService.warn('Some view descriptors are invalid or missing id');
			}

			if (validDescriptors.length > 0) {
				// 安全地调用父类方法
				super.restoreViewSizes();
			}
		} catch (error) {
			this.logService.error('Error restoring view sizes', error);
		}
	}

	// 添加更多的错误防护
	override layout(dimension: DOM.Dimension): void {
		try {
			// 在访问任何属性前检查
			if (!this.element || !document.body.contains(this.element)) {
				this.logService.warn('Container element is not attached in layout');
				return;
			}

			super.layout(dimension);
		} catch (error) {
			this.logService.error('Error in layout', error);
		}
	}
}

// 注册AI助手服务
class AIAssistantServiceImpl implements IAIAssistantService {
	constructor(
		@ILogService private readonly logService: ILogService
	) {
		// 防御性编程，避免 logService 未定义时报错
		if (this.logService) {
			this.logService.info('AI Assistant Service initialized');
		} else {
			console.log('AI Assistant Service initialized (logService not available)');
		}
	}

	async ask(request: IAIRequest): Promise<IAIResponse> {
		try {
			// 模拟AI响应
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve({
						content: `收到您的请求："${request.prompt}"。\n\n这是一个模拟的AI响应，实际实现需要连接到AI服务。`
					});
				}, 1000);
			});
		} catch (error) {
			if (this.logService) {
				this.logService.error('Error in AI Assistant Service ask method', error);
			} else {
				console.error('Error in AI Assistant Service ask method', error);
			}
			throw error;
		}
	}
}

registerSingleton(IAIAssistantService, AIAssistantServiceImpl);

// 注册视图容器和视图 - 添加错误处理
try {
	const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
	if (!viewContainersRegistry) {
		throw new Error('Failed to get view containers registry');
	}

	// 使用标准的 ViewPaneContainer，不需要自定义容器
	const viewContainer = viewContainersRegistry.registerViewContainer({
		id: AI_ASSISTANT_VIEW_CONTAINER_ID,
		title: localize('aiAssistant.containerTitle', 'AI 助手'),
		icon: aiAssistantIcon,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AI_ASSISTANT_VIEW_CONTAINER_ID, {
			mergeViewWithContainerWhenSingleView: true,
			orientation: Orientation.VERTICAL
		}]),
		storageId: AI_ASSISTANT_VIEW_CONTAINER_ID,
		hideIfEmpty: false,
		order: 100
	}, ViewContainerLocation.AuxiliaryBar);

	const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
	if (!viewsRegistry) {
		throw new Error('Failed to get views registry');
	}

	viewsRegistry.registerViews([{
		id: AIAssistantPanel.ID, // 确保ID与类中的静态ID一致
		name: localize('aiAssistant.view.name', 'AI 助手'),
		ctorDescriptor: new SyncDescriptor(AIAssistantPanel),
		containerIcon: aiAssistantIcon,
		canToggleVisibility: true,
		canMoveView: true,
		when: undefined,
		collapsed: false,
		// 确保视图容器设置正确
		viewContainer: viewContainer
	}], viewContainer);
} catch (error) {
	console.error('Failed to register AI Assistant view container and views', error);
}

// 注册配置
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'aiAssistant',
		title: localize('aiAssistantConfigurationTitle', "AI 助手"),
		type: 'object',
		properties: {
			'aiAssistant.enabled': {
				type: 'boolean',
				default: true,
				description: localize('aiAssistant.enabled', "是否启用 AI 助手功能"),
				scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
			},
			'aiAssistant.inlineCompletion.enabled': {
				type: 'boolean',
				default: true,
				description: localize('aiAssistant.inlineCompletion.enabled', "是否启用 AI 内联代码补全功能"),
				scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
			},
			'aiAssistant.apiEndpoint': {
				type: 'string',
				default: 'https://api.openai.com/v1/chat/completions',
				description: localize('aiAssistant.apiEndpoint', "AI 服务 API 端点"),
				scope: ConfigurationScope.APPLICATION
			},
			'aiAssistant.apiKey': {
				type: 'string',
				default: '',
				description: localize('aiAssistant.apiKey', "AI 服务 API 密钥"),
				scope: ConfigurationScope.APPLICATION
			},
			'aiAssistant.modelName': {
				type: 'string',
				default: 'gpt-3.5-turbo',
				description: localize('aiAssistant.modelName', "使用的 AI 模型名称"),
				scope: ConfigurationScope.APPLICATION
			}
		}
	});

// 注册内联补全提供者
class AIAssistantInlineCompletionProvider extends Disposable {
	constructor(
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.logService.info('AI Assistant Inline Completion Provider initialized');
	}

	provideInlineCompletions() {
		// 基础实现
		return { items: [] };
	}
}

// 注册内联补全编辑器贡献
class AIAssistantEditorContribution extends Disposable implements IEditorContribution {
	static readonly ID = 'editor.contrib.aiAssistant';
	private readonly disposables = new DisposableStore();

	constructor(
		editor: ICodeEditor,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.logService.info('AI Assistant Editor Contribution initialized');

		// 注册内联补全提供者
		this.registerInlineCompletionProvider();
	}

	private registerInlineCompletionProvider(): void {
		try {
			const provider = this.instantiationService.createInstance(AIAssistantInlineCompletionProvider);

			const providerRegistration = this.languageFeaturesService.inlineCompletionsProvider.register(
				{ scheme: Schemas.file },
				provider
			);

			this.disposables.add(providerRegistration);
			this.disposables.add(provider);
		} catch (error) {
			this.logService.error('Error registering inline completion provider', error);
		}
	}

	override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}
}

// 注册命令 - 添加错误处理
class AIAssistantAskSelectionAction extends Action2 {
	static readonly ID = 'aiAssistant.askSelection';

	constructor() {
		super({
			id: AIAssistantAskSelectionAction.ID,
			title: { value: localize('aiAssistant.askSelection', "请 AI 分析选中代码"), original: 'Ask AI about Selection' },
			f1: true,
			category: { value: localize('aiAssistant.category', "AI 助手"), original: 'AI Assistant' },
			precondition: EditorContextKeys.hasNonEmptySelection,
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA
			},
			menu: [{
				id: MenuId.EditorContext,
				group: 'navigation',
				when: EditorContextKeys.hasNonEmptySelection
			}]
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		try {
			const editorService = accessor.get(IEditorService);
			const aiAssistantService = accessor.get(IAIAssistantService);
			const viewsService = accessor.get(IViewsService);
			const logService = accessor.get(ILogService);

			logService.info('AI Assistant Ask Selection action triggered');

			// 获取当前选中代码
			const activeEditor = editorService.activeTextEditorControl;
			if (!activeEditor || !('getModel' in activeEditor)) {
				logService.warn('No active editor or editor does not have getModel method');
				return;
			}

			const model = (activeEditor as ICodeEditor).getModel();
			if (!model) {
				logService.warn('No model in active editor');
				return;
			}

			const selection = (activeEditor as ICodeEditor).getSelection();
			if (!selection || selection.isEmpty()) {
				logService.warn('No selection or selection is empty');
				return;
			}

			// 获取选中的代码
			const selectedCode = model.getValueInRange(selection);
			if (!selectedCode) {
				logService.warn('Selected code is empty');
				return;
			}

			// 获取文件路径
			let filePath = '';
			if (model.uri) {
				filePath = model.uri.fsPath;
			}

			// 先打开视图容器
			logService.info('Opening AI Assistant view container');
			try {
				await viewsService.openViewContainer(AI_ASSISTANT_VIEW_CONTAINER_ID, true);
			} catch (error) {
				logService.error('Error opening AI Assistant view container', error);
				throw error;
			}

			// 发送请求到AI助手
			const request: IAIRequest = {
				prompt: localize('aiAssistant.analyzeCode', "分析这段代码并提供改进建议"),
				codeContext: selectedCode,
				filePath
			};

			logService.info('Sending request to AI Assistant service');
			await aiAssistantService.ask(request);
		} catch (error) {
			console.error('Error in AIAssistantAskSelectionAction.run', error);
		}
	}
}

class AIAssistantOpenPanelAction extends Action2 {
	static readonly ID = 'aiAssistant.openPanel';

	constructor() {
		super({
			id: AIAssistantOpenPanelAction.ID,
			title: { value: localize('aiAssistant.openPanel', "打开 AI 助手"), original: 'Open AI Assistant' },
			f1: true,
			category: { value: localize('aiAssistant.category', "AI 助手"), original: 'AI Assistant' },
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyA
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		try {
			const viewsService = accessor.get(IViewsService);
			const logService = accessor.get(ILogService);

			logService.info('AI Assistant Open Panel action triggered');

			// 打开AI助手视图容器
			await viewsService.openViewContainer(AI_ASSISTANT_VIEW_CONTAINER_ID, true);
		} catch (error) {
			console.error('Error in AIAssistantOpenPanelAction.run', error);
		}
	}
}

// 注册所有功能 - 添加错误处理
export function registerAIAssistant(): void {
	try {
		// 注册命令
		registerAction2(AIAssistantAskSelectionAction);
		registerAction2(AIAssistantOpenPanelAction);

		// 注册编辑器贡献
		registerEditorContribution(AIAssistantEditorContribution.ID, AIAssistantEditorContribution);

		// 注册焦点命令
		class FocusAIAssistantAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.focusAIAssistant',
					title: { value: localize('aiAssistant.focus', "聚焦 AI 助手"), original: 'Focus AI Assistant' },
					category: { value: localize('aiAssistant.category', "AI 助手"), original: 'AI Assistant' },
					f1: true,
					keybinding: {
						primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyA,
						weight: KeybindingWeight.WorkbenchContrib
					},
					menu: {
						id: MenuId.ViewTitle,
						when: ContextKeyExpr.equals('view', AI_ASSISTANT_PANEL_ID)
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				try {
					const viewsService = accessor.get(IViewsService);
					const logService = accessor.get(ILogService);

					logService.info('Focus AI Assistant action triggered');

					// 打开视图面板
					await viewsService.openView(AI_ASSISTANT_PANEL_ID, true);
				} catch (error) {
					console.error('Error in FocusAIAssistantAction.run', error);
				}
			}
		}

		registerAction2(FocusAIAssistantAction);
	} catch (error) {
		console.error('Error registering AI Assistant functionality', error);
	}
}

// 立即注册所有功能
registerAIAssistant();
