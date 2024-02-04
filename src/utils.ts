import os from 'node:os'
import { dirname, join } from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import type { Buffer } from 'node:buffer'
import process from 'node:process'
import which from 'which'

/**
 * 该常量的目的是为跨不同操作系统存储临时文件提供一致的位置
 * 这在使用 TypeScript CLI 和处理文件操作时非常有用。
 */
export const CLI_TEMP_DIR = join(os.tmpdir(), 'antfu-ni')

/**
 * 在数组中删除指定的元素
 * @param arr 目标数组
 * @param v 需要被删除的元素
 * @returns 返回删掉后的数组
 */
export function remove<T>(arr: T[], v: T) {
  const index = arr.indexOf(v)
  if (index >= 0)
    arr.splice(index, 1)

  return arr
}

/**
 * 在数组中过滤掉与目标元素v相同的元素
 * @param arr
 * @param v
 * @returns 通过浅拷贝复制过滤过后的数组
 */
export function exclude<T>(arr: T[], v: T) {
  return arr.slice().filter(item => item !== v)
}

/**
 * 寻找cmd是否存在于环境变量中有可执行文件
 * @param cmd
 * @returns 返回布尔值或者null
 */
export function cmdExists(cmd: string) {
  /**
   * 如果设置了nothrow则如果没找到返回null
   */
  return which.sync(cmd, { nothrow: true }) !== null
}

/**
 * 当环境变量中存在volta时，返回 VOLTA_PREFIX 否则返回空字符串
 * @returns
 */
export function getVoltaPrefix(): string {
  // https://blog.volta.sh/2020/11/25/command-spotlight-volta-run/
  const VOLTA_PREFIX = 'volta run'
  const hasVoltaCommand = cmdExists('volta')
  return hasVoltaCommand ? VOLTA_PREFIX : ''
}

interface TempFile {
  path: string
  fd: fs.FileHandle
  cleanup: () => void
}

let counter = 0

/**
 *
 * @returns 这是一个 TypeScript 函数 openTemp
 * 用于创建具有唯一名称的临时文件并返回其文件描述符。
 * 该函数还包括一个 cleanup 方法，用于在不再需要时删除临时文件。
 */
async function openTemp(): Promise<TempFile | undefined> {
  /**
   * 函数检查临时目录 CLI_TEMP_DIR 是否存在。
   */
  if (!existsSync(CLI_TEMP_DIR))
  /**
   * 如果不存在，它使用 fs.mkdir 创建目录，并使用 recursive: true 选项进行递归创建。
   */
    await fs.mkdir(CLI_TEMP_DIR, { recursive: true })

  /**
   * 函数递增 counter 变量，并通过连接临时目录、进程 ID 和计数器来创建唯一的文件路径。
   */
  const competitivePath = join(CLI_TEMP_DIR, `.${process.pid}.${counter}`)
  counter++

  /**
   * wx是一个文件打开模式
   * 它的含义是：类似w模式（写入模式），但是如果文件路径存在，则文件写入失败。
   */
  return fs.open(competitivePath, 'wx')
    .then(fd => ({
      fd,
      path: competitivePath,
      cleanup() {
        fd.close().then(() => {
          /**
           * 如果文件存在，则删除文件
           */
          if (existsSync(competitivePath))
            /**
             * fs.unlink是fs模块提供的方法之一，用于删除文件系统中的文件。该方法是异步操作
             */
            fs.unlink(competitivePath)
        })
      },
    }))
    .catch((error: any) => {
      /**
       * 如果创建文件时出现错误
       * 函数检查错误是否是由于文件已存在。
       */
      if (error && error.code === 'EEXIST')
        return openTemp()

      else
        return undefined
    })
}

/**
 * Write file safely avoiding conflicts
 * 安全写入文件避免冲突
 */
export async function writeFileSafe(
  path: string,
  data: string | Buffer = '',
): Promise<boolean> {
  const temp = await openTemp()

  if (temp) {
    fs.writeFile(temp.path, data)
      .then(() => {
        /**
         * 获取当前文件路径的目录层路径
         */
        const directory = dirname(path)
        /**
         * 如果文件目录不存在则创建目录(递归创建)
         */
        if (!existsSync(directory))
          fs.mkdir(directory, { recursive: true })

        /**
         * 用于将文件或目录重命名为新的名称
         */
        return fs.rename(temp.path, path)
          .then(() => true)
          .catch(() => false)
      })
      .catch(() => false)
      /**
       * 如果文件写入失败，则删除文件
       */
      .finally(temp.cleanup)
  }

  return false
}
