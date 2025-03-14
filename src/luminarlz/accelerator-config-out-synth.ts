import * as fs from 'fs';
import * as path from 'path';
import { Liquid } from 'liquidjs';
import { loadConfigSync } from '../config';
import { currentExecutionPath } from '../util/path';

export const acceleratorConfigOutSynth = async () => {
  const config = loadConfigSync();
  const templatePath = currentExecutionPath(
    config.awsAcceleratorConfigTemplates,
  );

  // create aws accelerator config out path
  const outPath = currentExecutionPath(config.awsAcceleratorConfigOutPath);
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(outPath);
  }

  // render all templates and copy all other files to the aws accelerator config out path
  const liquid = new Liquid({
    root: templatePath,
    // fail on undefined variables
    strictVariables: true,
    strictFilters: true,
    // but allow to check for undefined variables in conditions
    lenientIf: true,
    // the default delimiters {{ }} are already in use by the LZA and shouldn't be replaced
    outputDelimiterLeft: '<%',
    outputDelimiterRight: '%>',
  });
  const templateFiles = await fs.promises.readdir(templatePath, {
    recursive: true,
  });
  for (const templateFile of templateFiles) {
    if (fs.lstatSync(path.join(templatePath, templateFile)).isDirectory()) {
      // Create directory in the output path if it doesn't exist
      if (!fs.existsSync(path.join(outPath, templateFile))) {
        fs.mkdirSync(path.join(outPath, templateFile));
      }
    } else {
      // if the file is a template and is defined as template, render it and write it to the output path
      const template = config.templates.find((t) =>
        templateFile.endsWith(t.fileName + '.liquid'),
      );
      if (template) {
        const output = liquid.renderFileSync(
          path.join(templatePath, `${template.fileName}.liquid`),
          template.parameters ?? {},
        );
        fs.writeFileSync(path.join(outPath, template.fileName), output);
      } else {
        // otherwise copy the file to the output path
        fs.copyFileSync(
          path.join(templatePath, templateFile),
          path.join(outPath, templateFile),
        );
      }
    }
  }

  // copy all cdk out templates to the aws accelerator config out path
  const cdkOutTemplatesFiles = fs
    .readdirSync(currentExecutionPath(config.cdkOutPath), {
      recursive: true,
    })
    .map((fileName) => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('Invalid file name');
      }
      return currentExecutionPath(config.cdkOutPath, fileName);
    })
    .filter((fileName) => {
      return (
        fs.lstatSync(fileName).isFile() && fileName.endsWith('.template.json')
      );
    });
  for (const cdkOutTemplatesFile of cdkOutTemplatesFiles) {
    if (!fs.existsSync(path.join(outPath, config.cdkOutPath))) {
      fs.mkdirSync(path.join(outPath, config.cdkOutPath), {
        recursive: true,
      });
    }
    fs.copyFileSync(
      cdkOutTemplatesFile,
      path.join(
        outPath,
        config.cdkOutPath,
        path.basename(cdkOutTemplatesFile),
      ),
    );
  }
};