import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");

async function deploySystem() {
  const [, verifier, outsider, agent] = await ethers.getSigners();
  const core = await ethers.deployContract("MaatCore", [verifier.address]);
  const policy = await ethers.deployContract("MaatPolicy", [await core.getAddress()]);
  return { verifier, outsider, agent, core, policy };
}

async function recordExecutions(
  core: Awaited<ReturnType<typeof ethers.deployContract>>,
  verifier: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  agent: string,
  count: number,
  failures: Set<number>,
  volume: bigint
) {
  for (let index = 0; index < count; index++) {
    await core
      .connect(verifier)
      .recordVerifiedExecution(
        agent,
        ethers.id(`execution-${count}-${index}`),
        !failures.has(index),
        volume,
        1_700_000_000n + BigInt(index)
      );
  }
}

describe("MaatCore and MaatPolicy", function () {
  it("keeps agents unrated until three verified executions", async function () {
    const { verifier, agent, core, policy } = await deploySystem();

    await recordExecutions(core, verifier, agent.address, 2, new Set(), ethers.parseEther("1000"));

    expect(await core.tierOf(agent.address)).to.equal(0n);
    expect(await policy.canOperate(agent.address)).to.equal(false);
    expect(await policy.delegationCap(agent.address)).to.equal(0n);
  });

  it("grants Bronze after three executions at or above 70 percent success", async function () {
    const { verifier, agent, core, policy } = await deploySystem();

    await recordExecutions(core, verifier, agent.address, 3, new Set(), ethers.parseEther("1000"));

    expect(await core.tierOf(agent.address)).to.equal(1n);
    expect(await policy.canOperate(agent.address)).to.equal(true);
    expect(await policy.delegationCap(agent.address)).to.equal(ethers.parseEther("50000"));
  });

  it("grants Silver when count, success rate, and volume thresholds are met", async function () {
    const { verifier, agent, core, policy } = await deploySystem();

    await recordExecutions(
      core,
      verifier,
      agent.address,
      10,
      new Set([9]),
      ethers.parseEther("1000")
    );

    expect(await core.tierOf(agent.address)).to.equal(2n);
    expect(await policy.delegationCap(agent.address)).to.equal(ethers.parseEther("250000"));
  });

  it("grants Gold when count, success rate, and volume thresholds are met", async function () {
    const { verifier, agent, core, policy } = await deploySystem();

    await recordExecutions(
      core,
      verifier,
      agent.address,
      25,
      new Set([23, 24]),
      ethers.parseEther("4000")
    );

    expect(await core.tierOf(agent.address)).to.equal(3n);
    expect(await policy.delegationCap(agent.address)).to.equal(ethers.parseEther("1000000"));
  });

  it("suspends an agent with enough history below the success floor", async function () {
    const { verifier, agent, core, policy } = await deploySystem();

    await recordExecutions(
      core,
      verifier,
      agent.address,
      3,
      new Set([1, 2]),
      ethers.parseEther("1000")
    );

    expect(await core.tierOf(agent.address)).to.equal(4n);
    expect(await policy.canOperate(agent.address)).to.equal(false);
    expect(await policy.delegationCap(agent.address)).to.equal(0n);
  });

  it("allows only the configured verifier to update metrics", async function () {
    const { outsider, agent, core } = await deploySystem();

    await expect(
      core
        .connect(outsider)
        .recordVerifiedExecution(agent.address, ethers.id("unauthorized"), true, 1n, 1n)
    ).to.be.revertedWith("caller is not verifier");
  });

  it("rejects a replayed execution ID", async function () {
    const { verifier, agent, core } = await deploySystem();
    const executionId = ethers.id("duplicate-execution");

    await core
      .connect(verifier)
      .recordVerifiedExecution(agent.address, executionId, true, 1n, 1n);

    await expect(
      core
        .connect(verifier)
        .recordVerifiedExecution(agent.address, executionId, true, 1n, 2n)
    ).to.be.revertedWith("execution already processed");
  });
});
