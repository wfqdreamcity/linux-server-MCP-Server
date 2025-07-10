# 远程Linux服务器MCP服务

这是一个用于连接和操作远程Linux服务器的MCP (Model Context Protocol) 服务。

## 功能特性

### 工具 (Tools)
- **execute_command**: 在远程Linux服务器上执行命令
- **read_file**: 读取远程服务器上的文件内容
- **write_file**: 在远程服务器上写入文件
- **upload_file**: 上传本地文件到远程服务器
- **download_file**: 从远程服务器下载文件到本地
- **list_directory**: 列出远程目录内容
- **system_monitor**: 获取系统监控信息 (CPU、内存、磁盘、网络)

### 资源 (Resources)
- **linux://system/info**: 系统信息
- **linux://system/processes**: 进程列表
- **linux://system/disk**: 磁盘使用情况
- **linux://system/memory**: 内存使用情况

## 配置说明

### 环境变量
服务需要以下环境变量来连接远程服务器：

- `SSH_HOST`: SSH服务器地址
- `SSH_PORT`: SSH端口 (默认22)
- `SSH_USERNAME`: SSH用户名
- `SSH_PRIVATE_KEY_PATH`: SSH私钥文件路径
- `SSH_PASSPHRASE`: 私钥密码 (可选)

## 使用示例

### 通过大模型使用

一旦MCP服务配置完成，您可以通过以下方式与大模型交互：

1. **执行远程命令**:
   ```
   请在远程服务器上执行 "ls -la /home" 命令
   ```

2. **查看系统信息**:
   ```
   请查看远程服务器的系统信息
   ```

3. **监控系统状态**:
   ```
   请监控远程服务器的CPU和内存使用情况
   ```

4. **文件操作**:
   ```
   请读取远程服务器上 /etc/hostname 文件的内容
   ```

5. **文件传输**:
   ```
   请将本地文件 /path/to/local/file 上传到远程服务器的 /path/to/remote/file
   ```

## 安全注意事项

1. **私钥安全**: 确保SSH私钥文件权限设置正确 (600)
2. **网络安全**: 建议使用VPN或安全网络连接
3. **访问控制**: 仅授权必要的用户访问
4. **日志监控**: 定期检查服务器访问日志

## 故障排除

### 常见问题

1. **连接失败**:
   - 检查SSH服务器地址和端口
   - 验证私钥文件路径和权限
   - 确认网络连通性

2. **认证失败**:
   - 检查用户名是否正确
   - 验证私钥文件格式
   - 确认私钥密码 (如果有)

3. **权限错误**:
   - 检查远程用户权限
   - 验证文件/目录访问权限

## 开发信息

- **语言**: TypeScript/Node.js
- **依赖**: ssh2, @modelcontextprotocol/sdk
- **构建**: `npm run build`
- **启动**: `node build/index.js`
