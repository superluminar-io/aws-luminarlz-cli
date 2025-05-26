import * as fs from 'fs';
import * as path from 'path';
import { Liquid } from 'liquidjs';
import { loadConfigSync } from '../../../config';
import { resolveProjectPath } from '../../util/path';

export const synthConfigOut = async () => {
  const config = loadConfigSync();
  const templatePath = resolveProjectPath(
    config.awsAcceleratorConfigTemplates,
  );

  // create aws accelerator config out path
  const outPath = resolveProjectPath(config.awsAcceleratorConfigOutPath);
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
  const filePathes = await fs.promises.readdir(templatePath, {
    recursive: true,
  });
  for (const filePath of filePathes) {
    if (fs.lstatSync(path.join(templatePath, filePath)).isDirectory()) {
      // Create directory in the output path if it doesn't exist
      if (!fs.existsSync(path.join(outPath, filePath))) {
        fs.mkdirSync(path.join(outPath, filePath));
      }
    } else {
      // if the file is a template and is defined as template, render it and write it to the output path
      if (!filePath.endsWith('.liquid')) {
        // otherwise copy the file to the output path
        fs.copyFileSync(
          path.join(templatePath, filePath),
          path.join(outPath, filePath),
        );
      } else {
        const template = config.templates.find((t) =>
          filePath.endsWith(t.fileName + '.liquid'),
        );
        if (!template) {
          throw new Error('Template not found in config.');
        }
        const output = liquid.renderFileSync(
          path.join(templatePath, `${template.fileName}.liquid`),
          template.parameters ?? {},
        );
        fs.writeFileSync(path.join(outPath, template.fileName), output);
      }
    }
  }

  // copy all cdk out templates to the aws accelerator config out path
  const cdkOutTemplatesFiles = fs
    .readdirSync(resolveProjectPath(config.cdkOutPath), {
      recursive: true,
    })
    .map((fileName) => {
      if (!fileName || typeof fileName !== 'string') {
        throw new Error('Invalid file name');
      }
      return resolveProjectPath(config.cdkOutPath, fileName);
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