const fs = require('fs');
const path = require('path');
const util = require('./common-npm-packages/build-scripts/util');
const minimist = require('minimist');

const ignoredFolders = ['build-scripts', '.git', '_download', 'node_modules'];
const defaultTestSuite = 'L0';
const predefinedFlags = {
    boolean: [
        'build',
        'test'
    ],
    string: [
        'suite'
    ]
};

const options = minimist(process.argv, predefinedFlags)
const testResultsPath = path.join(__dirname, 'test-results');
const mochaReporterPath = path.join(__dirname, 'common-npm-packages', 'build-scripts', 'junit-spec-reporter.js');
const coverageBaseName = 'cobertura-coverage.xml'

const printLabel = (name) => {
    console.log('\n----------------------------------');
    console.log(name);
    console.log('----------------------------------');
}

const buildPsTestHelpers = () => {
    console.log('Building Tests');
    util.cd('Tests');
    util.run('npm install');
    util.run(path.join('node_modules', '.bin', 'tsc'));
    util.cd('..');
}

if (options.build) {
    buildPsTestHelpers();

    console.log('\nBuilding shared npm packages');
    util.cd('common-npm-packages');
    fs.readdirSync('./', { encoding: 'utf-8' }).forEach(child => {
        if (fs.statSync(child).isDirectory() && !ignoredFolders.includes(child)) {
            printLabel(child);

            util.cd(child);
            util.run('npm install');
            util.run('npm run build');
            util.cd('..');
        }
    });
}

if (options.test) {
    const gitkeepName = '.gitkeep';
    const coveredFiles = [];
    console.log('Testing shared npm packages');
    util.cd('common-npm-packages');
    const suite = options.suite || defaultTestSuite;
    let testsFailed = false;
    util.cleanFolder(testResultsPath, [gitkeepName]);

    fs.readdirSync('./', { encoding: 'utf-8' }).forEach(child => {
        if (fs.statSync(child).isDirectory() && !ignoredFolders.includes(child)) {
            printLabel(child);

            if (fs.existsSync(path.join('./', child, '_build'))) {
                util.cd(path.join(child, '_build'));

                if (fs.existsSync(path.join('./', 'Tests', `${suite}.js`))) {
                    try {
                        const suitName = `${child}-suite`;
                        const coverageName = `${child}-coverage.xml`;
                        const mochaOptions = util.createMochaOptions(mochaReporterPath, testResultsPath, suitName);

                        util.run(`c8 --all --reports-dir ${testResultsPath} mocha ${mochaOptions} Tests/${suite}.js`, true);
                        util.renameFile(testResultsPath, coverageBaseName, coverageName);
                        coveredFiles.push({
                            taskName: child,
                            path: path.join(testResultsPath, coverageName)
                        });
                    } catch (err) {
                        testsFailed = true;
                    } finally {
                        util.cd('../..');
                    }
                } else {
                    console.log('No tests found for the package');
                    util.cd('../..');
                }
            } else {
                throw new Error('Package has not been built');
            }
        }
    });
    if (testsFailed) {
        throw new Error('Tests failed!');
    }

    if (coveredFiles.length) {
        const mergePath = path.join(testResultsPath, 'Cobertura.xml');
        const coveredFilesString = coveredFiles.
            map(function(task) {
                return `${task.taskName}=${task.path}`;
            }).
            join(' ');

        util.run(`cobertura-merge -o ${mergePath} ${coveredFilesString}`, true);
    }
}
