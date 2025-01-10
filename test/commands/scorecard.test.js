// Import Node.js Dependencies
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test, mock } from "node:test";
import assert from "node:assert";

// Import Third-party Dependencies
import esmock from "esmock";
import { API_URL } from "@nodesecure/ossf-scorecard-sdk";
import { Ok } from "@openally/result";

// Import Internal Dependencies
import { runProcess } from "../helpers/cliCommandRunner.js";
import { arrayFromAsync, getExpectedScorecardLines } from "../helpers/utils.js";

// CONSTANTS
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const kProcessDir = path.join(__dirname, "..", "process");
const kProcessPath = path.join(kProcessDir, "scorecard.js");

test("scorecard should display fastify scorecard", async() => {
  const packageName = "fastify/fastify";
  const mockBody = {
    date: "2222-12-31",
    repo: {
      name: `github.com/${packageName}`
    },
    score: 5.2,
    checks: [
      {
        name: "Maintained",
        score: -1,
        reason: "Package is maintained"
      }
    ]
  };
  const scorecardCliOptions = {
    path: kProcessPath,
    args: [packageName],
    undiciMockAgentOptions: [
      {
        baseUrl: API_URL,
        intercept: {
          path: `/projects/github.com/${packageName}`,
          method: "GET"
        },
        response: {
          body: mockBody,
          status: 200
        }
      },
      {
        baseUrl: "https://api.github.com",
        intercept: {
          path: "/repos/fastify/fastify",
          method: "GET"
        },
        response: {
          body: {
            full_name: "fastify/fastify"
          },
          status: 200
        }
      }
    ]
  };

  const givenLines = await arrayFromAsync(runProcess(scorecardCliOptions));
  const expectedLines = getExpectedScorecardLines(packageName, mockBody);

  assert.deepEqual(givenLines, expectedLines, `lines should be ${expectedLines}`);
});

test("should not display scorecard for unknown repository", async() => {
  const packageName = "fastify/fastify";
  const scorecardCliOptions = {
    path: kProcessPath,
    args: [packageName],
    undiciMockAgentOptions: [{
      baseUrl: API_URL,
      intercept: {
        path: `/projects/github.com/${packageName}`,
        method: "GET"
      },
      response: {
        body: {},
        status: 500
      }
    }]
  };

  const expectedLines = [
    `${packageName} is not part of the OSSF Scorecard BigQuery public dataset.`
  ];
  const givenLines = await arrayFromAsync(runProcess(scorecardCliOptions));

  assert.deepEqual(givenLines, expectedLines, `lines should be ${expectedLines}`);
});

// test("should retrieve repository whithin git config", async() => {
//   const testingModule = await esmock("../../src/commands/scorecard.js", {
//     fs: {
//       readFileSync: () => [
//         "[remote \"origin\"]",
//         "\turl = git@github.com:myawesome/repository.git"
//       ].join("\n")
//     }
//   });

//   assert.deepEqual(testingModule.getCurrentRepository(), Ok(["myawesome/repository", "github"]));
// });

//this test below converts the above 'commentted out' test using the new MockTracker class 
test("should retrieve repository within git config", async () => {
  mock.module('fs', {
    readFileSync: () => [
      "[remote \"origin\"]",
      "\turl = git@github.com:myawesome/repository.git"
    ].join("\n") 
  });

  const testingModule = await import("../../src/commands/scorecard.js");

  assert.deepEqual(testingModule.getCurrentRepository(), Ok(["myawesome/repository", "github"]));
});

// test("should not find origin remote", async() => {
//   const testingModule = await esmock("../../src/commands/scorecard.js", {
//     fs: {
//       readFileSync: () => "just one line"
//     }
//   });
//   const result = testingModule.getCurrentRepository();

//   assert.equal(result.err, true);
//   assert.equal(result.val, "Cannot find origin remote.");
// });

//this test below converts the above 'commentted out' test using the new MockTracker class 
test("should not find origin remote", async () => {
  mock.module('fs', {
    readFileSync: () => "just one line" 
  });

  const testingModule = await import("../../src/commands/scorecard.js");

  const result = testingModule.getCurrentRepository();

  assert.equal(result.err, true);
  assert.equal(result.val, "Cannot find origin remote.");
});