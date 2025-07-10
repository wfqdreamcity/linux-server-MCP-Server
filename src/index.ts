#!/usr/bin/env node

/**
 * 远程Linux服务器MCP服务
 * 提供连接和操作远程Linux服务器的功能，包括：
 * - 执行远程命令
 * - 文件传输（上传/下载）
 * - 系统信息查询
 * - 进程管理
 * - 文件系统操作
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Client } from 'ssh2';
import * as fs from 'fs';
import * as path from 'path';

// SSH连接配置接口
interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

// SSH连接池
const connections = new Map<string, Client>();

// 从环境变量获取SSH配置
function getSSHConfig(): SSHConfig {
  const host = process.env.SSH_HOST;
  const port = parseInt(process.env.SSH_PORT || '22');
  const username = process.env.SSH_USERNAME;
  const password = process.env.SSH_PASSWORD;
  const privateKeyPath = process.env.SSH_PRIVATE_KEY_PATH;
  const passphrase = process.env.SSH_PASSPHRASE;

  if (!host || !username) {
    throw new Error('SSH_HOST and SSH_USERNAME environment variables are required');
  }

  const config: SSHConfig = {
    host,
    port,
    username,
  };

  if (password) {
    config.password = password;
  } else if (privateKeyPath) {
    try {
      config.privateKey = fs.readFileSync(privateKeyPath, 'utf8');
      if (passphrase) {
        config.passphrase = passphrase;
      }
    } catch (error) {
      throw new Error(`Failed to read private key from ${privateKeyPath}: ${error}`);
    }
  } else {
    throw new Error('Either SSH_PASSWORD or SSH_PRIVATE_KEY_PATH must be provided');
  }

  return config;
}

// 创建SSH连接
async function createSSHConnection(config: SSHConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    
    conn.on('ready', () => {
      resolve(conn);
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect(config);
  });
}

// 获取或创建SSH连接
async function getSSHConnection(): Promise<Client> {
  const config = getSSHConfig();
  const connectionKey = `${config.host}:${config.port}:${config.username}`;
  
  let conn = connections.get(connectionKey);
  if (!conn) {
    conn = await createSSHConnection(config);
    connections.set(connectionKey, conn);
  }
  
  return conn;
}

// 执行远程命令
async function executeRemoteCommand(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const conn = await getSSHConnection();
  
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = '';
      let stderr = '';

      stream.on('close', (code: number) => {
        resolve({ stdout, stderr, exitCode: code });
      });

      stream.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    });
  });
}

// 获取远程文件内容
async function getRemoteFileContent(filePath: string): Promise<string> {
  const conn = await getSSHConnection();
  
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }

      sftp.readFile(filePath, 'utf8', (err: any, data: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data.toString());
      });
    });
  });
}

// 上传文件到远程服务器
async function uploadFile(localPath: string, remotePath: string): Promise<void> {
  const conn = await getSSHConnection();
  
  return new Promise((resolve, reject) => {
    conn.sftp((err: any, sftp: any) => {
      if (err) {
        reject(err);
        return;
      }

      const readStream = fs.createReadStream(localPath);
      const writeStream = sftp.createWriteStream(remotePath);
      
      writeStream.on('close', () => {
        resolve();
      });
      
      writeStream.on('error', (err: any) => {
        reject(err);
      });
      
      readStream.pipe(writeStream);
    });
  });
}

// 下载文件从远程服务器
async function downloadFile(remotePath: string, localPath: string): Promise<void> {
  const conn = await getSSHConnection();
  
  return new Promise((resolve, reject) => {
    conn.sftp((err: any, sftp: any) => {
      if (err) {
        reject(err);
        return;
      }

      const readStream = sftp.createReadStream(remotePath);
      const writeStream = fs.createWriteStream(localPath);
      
      writeStream.on('close', () => {
        resolve();
      });
      
      writeStream.on('error', (err: any) => {
        reject(err);
      });
      
      readStream.pipe(writeStream);
    });
  });
}

/**
 * 创建MCP服务器，提供远程Linux服务器操作功能
 */
const server = new Server(
  {
    name: "linux-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

/**
 * 资源处理器 - 列出可用的系统资源
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "linux://system/info",
        mimeType: "application/json",
        name: "系统信息",
        description: "远程Linux服务器的系统信息"
      },
      {
        uri: "linux://system/processes",
        mimeType: "application/json",
        name: "进程列表",
        description: "当前运行的进程列表"
      },
      {
        uri: "linux://system/disk",
        mimeType: "application/json",
        name: "磁盘使用情况",
        description: "磁盘空间使用情况"
      },
      {
        uri: "linux://system/memory",
        mimeType: "application/json",
        name: "内存使用情况",
        description: "内存使用情况"
      }
    ]
  };
});

/**
 * 资源读取处理器
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const resourcePath = url.pathname;

  try {
    let result: any;
    
    switch (resourcePath) {
      case '/system/info':
        const sysInfo = await executeRemoteCommand('uname -a && cat /etc/os-release');
        result = {
          system_info: sysInfo.stdout,
          timestamp: new Date().toISOString()
        };
        break;
        
      case '/system/processes':
        const processes = await executeRemoteCommand('ps aux --sort=-%cpu | head -20');
        result = {
          processes: processes.stdout,
          timestamp: new Date().toISOString()
        };
        break;
        
      case '/system/disk':
        const diskInfo = await executeRemoteCommand('df -h');
        result = {
          disk_usage: diskInfo.stdout,
          timestamp: new Date().toISOString()
        };
        break;
        
      case '/system/memory':
        const memInfo = await executeRemoteCommand('free -h && cat /proc/meminfo | head -10');
        result = {
          memory_info: memInfo.stdout,
          timestamp: new Date().toISOString()
        };
        break;
        
      default:
        throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${resourcePath}`);
    }

    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Failed to fetch resource: ${error}`);
  }
});

/**
 * 工具列表处理器
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "execute_command",
        description: "在远程Linux服务器上执行命令",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "要执行的命令"
            }
          },
          required: ["command"]
        }
      },
      {
        name: "read_file",
        description: "读取远程服务器上的文件内容",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "文件路径"
            }
          },
          required: ["path"]
        }
      },
      {
        name: "write_file",
        description: "在远程服务器上写入文件",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "文件路径"
            },
            content: {
              type: "string",
              description: "文件内容"
            }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "upload_file",
        description: "上传本地文件到远程服务器",
        inputSchema: {
          type: "object",
          properties: {
            local_path: {
              type: "string",
              description: "本地文件路径"
            },
            remote_path: {
              type: "string",
              description: "远程文件路径"
            }
          },
          required: ["local_path", "remote_path"]
        }
      },
      {
        name: "download_file",
        description: "从远程服务器下载文件到本地",
        inputSchema: {
          type: "object",
          properties: {
            remote_path: {
              type: "string",
              description: "远程文件路径"
            },
            local_path: {
              type: "string",
              description: "本地文件路径"
            }
          },
          required: ["remote_path", "local_path"]
        }
      },
      {
        name: "list_directory",
        description: "列出远程目录内容",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "目录路径",
              default: "."
            },
            detailed: {
              type: "boolean",
              description: "是否显示详细信息",
              default: false
            }
          }
        }
      },
      {
        name: "system_monitor",
        description: "获取系统监控信息",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["cpu", "memory", "disk", "network", "all"],
              description: "监控类型",
              default: "all"
            }
          }
        }
      }
    ]
  };
});

/**
 * 工具调用处理器
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "execute_command": {
        const command = String(request.params.arguments?.command);
        if (!command) {
          throw new Error("Command is required");
        }

        const result = await executeRemoteCommand(command);
        return {
          content: [{
            type: "text",
            text: `命令: ${command}\n退出码: ${result.exitCode}\n\n标准输出:\n${result.stdout}\n\n标准错误:\n${result.stderr}`
          }]
        };
      }

      case "read_file": {
        const filePath = String(request.params.arguments?.path);
        if (!filePath) {
          throw new Error("File path is required");
        }

        const content = await getRemoteFileContent(filePath);
        return {
          content: [{
            type: "text",
            text: `文件: ${filePath}\n\n内容:\n${content}`
          }]
        };
      }

      case "write_file": {
        const filePath = String(request.params.arguments?.path);
        const content = String(request.params.arguments?.content);
        if (!filePath || !content) {
          throw new Error("File path and content are required");
        }

        // 使用echo命令写入文件
        const command = `echo ${JSON.stringify(content)} > ${JSON.stringify(filePath)}`;
        const result = await executeRemoteCommand(command);
        
        if (result.exitCode === 0) {
          return {
            content: [{
              type: "text",
              text: `文件 ${filePath} 写入成功`
            }]
          };
        } else {
          throw new Error(`写入文件失败: ${result.stderr}`);
        }
      }

      case "upload_file": {
        const localPath = String(request.params.arguments?.local_path);
        const remotePath = String(request.params.arguments?.remote_path);
        if (!localPath || !remotePath) {
          throw new Error("Local path and remote path are required");
        }

        await uploadFile(localPath, remotePath);
        return {
          content: [{
            type: "text",
            text: `文件从 ${localPath} 上传到 ${remotePath} 成功`
          }]
        };
      }

      case "download_file": {
        const remotePath = String(request.params.arguments?.remote_path);
        const localPath = String(request.params.arguments?.local_path);
        if (!remotePath || !localPath) {
          throw new Error("Remote path and local path are required");
        }

        await downloadFile(remotePath, localPath);
        return {
          content: [{
            type: "text",
            text: `文件从 ${remotePath} 下载到 ${localPath} 成功`
          }]
        };
      }

      case "list_directory": {
        const dirPath = String(request.params.arguments?.path || ".");
        const detailed = Boolean(request.params.arguments?.detailed);
        
        const command = detailed ? `ls -la ${JSON.stringify(dirPath)}` : `ls ${JSON.stringify(dirPath)}`;
        const result = await executeRemoteCommand(command);
        
        return {
          content: [{
            type: "text",
            text: `目录: ${dirPath}\n\n${result.stdout}`
          }]
        };
      }

      case "system_monitor": {
        const monitorType = String(request.params.arguments?.type || "all");
        let commands: string[] = [];
        
        switch (monitorType) {
          case "cpu":
            commands = ["top -bn1 | head -20"];
            break;
          case "memory":
            commands = ["free -h", "cat /proc/meminfo | head -10"];
            break;
          case "disk":
            commands = ["df -h", "lsblk"];
            break;
          case "network":
            commands = ["netstat -tuln", "ss -tuln"];
            break;
          case "all":
          default:
            commands = [
              "uptime",
              "free -h",
              "df -h",
              "top -bn1 | head -10",
              "netstat -tuln | head -10"
            ];
            break;
        }
        
        const results = await Promise.all(
          commands.map(cmd => executeRemoteCommand(cmd))
        );
        
        const output = results.map((result, index) => 
          `=== ${commands[index]} ===\n${result.stdout}\n`
        ).join('\n');
        
        return {
          content: [{
            type: "text",
            text: `系统监控 (${monitorType}):\n\n${output}`
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `错误: ${error}`
      }],
      isError: true
    };
  }
});

/**
 * 启动服务器
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Linux服务器MCP服务已启动");
}

// 清理连接
process.on('SIGINT', () => {
  connections.forEach(conn => conn.end());
  process.exit(0);
});

process.on('SIGTERM', () => {
  connections.forEach(conn => conn.end());
  process.exit(0);
});

main().catch((error) => {
  console.error("服务器错误:", error);
  process.exit(1);
});
