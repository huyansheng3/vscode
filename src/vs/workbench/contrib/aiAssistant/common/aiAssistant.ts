//@ts-nocheck
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

// 服务标识符
export const IAIAssistantService = createDecorator<IAIAssistantService>('aiAssistantService');

// AI助手响应类型
export interface IAIResponse {
	content: string;
	isError?: boolean;
	codeModifications?: ICodeModification[];
}

// 代码修改类型
export interface ICodeModification {
	id: string;
	originalCode: string;
	modifiedCode: string;
	description: string;
	path?: string; // 可选的文件路径
	range?: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
}

// AI助手请求类型
export interface IAIRequest {
	prompt: string;
	context?: string;
	codeContext?: string;
	filePath?: string;
}

// AI助手服务接口
export interface IAIAssistantService {
	readonly _serviceBrand: undefined;

	// 事件
	readonly onDidReceiveResponse: Event<IAIResponse>;
	readonly onDidStartRequest: Event<IAIRequest>;

	// 向AI发送请求并获取响应
	ask(request: IAIRequest): Promise<IAIResponse>;

	// 应用代码修改
	applyCodeModification(modification: ICodeModification): Promise<boolean>;

	// 获取代码补全建议
	getCodeCompletion(document: string, position: { line: number, column: number }): Promise<string | null>;
}

// AI助手配置
export interface IAIAssistantConfig {
	apiEndpoint: string;
	apiKey?: string;
	modelName?: string;
	temperature?: number;
}
