import type { Config } from 'jest';

const config: Config = {
    coverageProvider: 'v8',
    setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
    testMatch: [
        '<rootDir>/@(src|test)/**/*(*.)@(spec|test).ts?(x)',
        '<rootDir>/@(src|test)/**/__tests__/**/*.ts?(x)',
        '<rootDir>/@(projenrc)/**/*(*.)@(spec|test).ts?(x)',
        '<rootDir>/@(projenrc)/**/__tests__/**/*.ts?(x)',
    ],
    testTimeout: 120000,
    clearMocks: true,
    collectCoverage: true,
    coverageReporters: ['json', 'lcov', 'clover', 'cobertura', 'text'],
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: ['/node_modules/'],
    testPathIgnorePatterns: ['/node_modules/'],
    watchPathIgnorePatterns: ['/node_modules/'],
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: 'test-reports',
            },
        ],
    ],
    transform: {
        '^.+\\.[tj]sx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.dev.json',
            },
        ],
    },
};

export default config;