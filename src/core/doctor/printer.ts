import { CheckResult, DoctorSummary } from './doctor';

const indentLines = (text: string, indent: string): string[] => {
  return text.split('\n').map((line) => `${indent}${line}`);
};

const formatCheckLines = (result: CheckResult): string[] => {
  const lines: string[] = [];
  lines.push(`${result.status.toUpperCase()}: ${result.label}`);
  lines.push(...indentLines(`ID: ${result.id}`, '  '));
  if (result.details) {
    lines.push(...indentLines(`Details: ${result.details}`, '  '));
  }
  if (result.fix) {
    lines.push(...indentLines(`Fix: ${result.fix}`, '  '));
  }
  return lines;
};

export const formatDoctorSummaryLines = (summary: DoctorSummary): string[] => {
  const lines: string[] = ['Doctor Check:'];
  summary.results.forEach((result, index) => {
    lines.push(...formatCheckLines(result));
    if (index < summary.results.length - 1) {
      lines.push('');
    }
  });
  const failureCount = summary.results.filter((result) => result.status === 'fail').length;
  lines.push(`Failures: ${failureCount} / ${summary.results.length}`);
  lines.push(summary.hasFailures ? 'Doctor: failures found.' : 'Doctor: all checks passed.');
  return lines;
};

export const writeDoctorSummary = (
  summary: DoctorSummary,
  writer: (line: string) => void = console.info,
): void => {
  for (const line of formatDoctorSummaryLines(summary)) {
    writer(line);
  }
};
