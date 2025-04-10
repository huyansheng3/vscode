//@ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/aiAssistant.css';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService, ViewContainer } from '../../../../workbench/common/views.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { AI_ASSISTANT_VIEW_CONTAINER_ID } from './aiAssistant.contribution.js';
/**
 * AI助手面板容器
 */
export class AIAssistantPanelContainer extends ViewPaneContainer {
	static readonly ID = 'workbench.view.aiAssistant';

	// 确保与静态ID保持一致，避免使用动态ID
	readonly storageId = 'workbench.view.aiAssistant';

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService private readonly logService: ILogService
	) {
		// 调用父类构造函数，使用类的静态ID以确保一致性
		super(
			AIAssistantPanelContainer.ID,
			{ mergeViewWithContainerWhenSingleView: true },
			instantiationService,
			configurationService,
			layoutService,
			contextMenuService,
			telemetryService,
			extensionService,
			themeService,
			storageService,
			contextService,
			viewDescriptorService,
			logService
		);

		this.logService.info('AI Assistant Panel Container initialized with ID:', AIAssistantPanelContainer.ID);
	}

	// 重写父类方法，添加防御性检查
	override restoreViewSizes(): void {
		// 防御性检查：确保视图容器模型和视图描述符存在
		if (!this.viewContainerModel || !this.viewContainerModel.visibleViewDescriptors) {
			this.logService.warn('View container model or visible view descriptors not available');
			return;
		}

		try {
			super.restoreViewSizes();
		} catch (error) {
			this.logService.error('Error restoring view sizes:', error);
		}
	}

	// 添加更多防御性检查
	override create(parent: HTMLElement): void {
		if (!parent) {
			this.logService.error('Parent element is undefined in AIAssistantPanelContainer.create');
			return;
		}

		try {
			// 先添加视图容器样式，然后再调用super.create
			parent.classList.add('ai-assistant-viewlet');

			// 创建一个loading元素，在初始化完成前显示
			const loadingElement = document.createElement('div');
			loadingElement.className = 'ai-assistant-loading';
			loadingElement.textContent = '加载AI助手中...';
			parent.appendChild(loadingElement);

			super.create(parent);

			// 初始化完成后移除loading
			if (loadingElement.parentElement) {
				loadingElement.parentElement.removeChild(loadingElement);
			}
		} catch (error) {
			this.logService.error('Error creating AI Assistant container', error);
			// 保证至少有一个基本的错误信息显示
			parent.innerHTML = '<div class="ai-assistant-error">加载AI助手面板容器时出错</div>';
		}
	}

	override getOptimalWidth(): number {
		return 400;
	}

	// 添加布局方法防御
	override layout(dimension: DOM.Dimension): void {
		try {
			// 在访问任何属性前检查
			if (!this.element || !document.body.contains(this.element)) {
				this.logService.warn('Container element is not attached in layout');
				return;
			}

			super.layout(dimension);
		} catch (error) {
			this.logService.error('Error in AIAssistantPanelContainer layout', error);
		}
	}

	// 添加更安全的视图相关方法
	override onDidAddViews(views: ViewPane[]): void {
		try {
			if (!views || views.length === 0) {
				this.logService.warn('No views to add');
				return;
			}

			// 确保每个视图在添加前进行检查
			const validViews = views.filter(view => {
				if (!view) {
					this.logService.warn('Encountered undefined view');
					return false;
				}

				if (!view.element) {
					this.logService.warn(`View ${view.id} has no element`);
					return false;
				}

				return true;
			});

			if (validViews.length !== views.length) {
				this.logService.warn(`Some views are invalid: ${views.length - validViews.length} of ${views.length}`);
			}

			if (validViews.length > 0) {
				// 使用try-catch包装super调用，避免一个视图的问题影响其他视图
				try {
					super.onDidAddViews(validViews);
				} catch (error) {
					this.logService.error('Error in super.onDidAddViews', error);
				}
			}
		} catch (error) {
			this.logService.error('Error in onDidAddViews', error);
		}
	}
}
