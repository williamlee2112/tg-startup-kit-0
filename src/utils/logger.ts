import chalk from 'chalk';

class Logger {
  private verbose = false;

  setVerbose(verbose: boolean) {
    this.verbose = verbose;
  }

  info(message: string) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string) {
    console.log(chalk.green('✅'), message);
  }

  warning(message: string) {
    console.log(chalk.yellow('⚠️'), message);
  }

  error(message: string) {
    console.log(chalk.red('❌'), message);
  }

  debug(message: string) {
    if (this.verbose) {
      console.log(chalk.gray('🔍'), chalk.gray(message));
    }
  }

  step(message: string) {
    console.log(chalk.cyan('🔧'), message);
  }

  newLine() {
    console.log('');
  }
}

export const logger = new Logger(); 