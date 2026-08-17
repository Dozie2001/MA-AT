import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create("hardhatMainnet");
const coder = ethers.AbiCoder.defaultAbiCoder();

const eventSignature = ethers.id(
  "AgentExecutionRecorded(address,bytes32,bool,uint256,uint256)"
);
const executionId = ethers.id("maat-decoder-test");
const volume = ethers.parseEther("1000");
const observedAt = 1_786_966_920n;

type EncodedOptions = {
  agent: string;
  reporter: string;
  destination?: string;
  emitter?: string;
  receiptStatus?: number;
  txType?: number;
  duplicateLog?: boolean;
};

function encodeAttestedTransaction(options: EncodedOptions) {
  const destination = options.destination ?? options.reporter;
  const emitter = options.emitter ?? options.reporter;
  const topics = [
    eventSignature,
    ethers.zeroPadValue(options.agent, 32),
    executionId
  ];
  const data = coder.encode(
    ["bool", "uint256", "uint256"],
    [true, volume, observedAt]
  );
  const sourceLog = [emitter, topics, data];
  const logs = options.duplicateLog ? [sourceLog, sourceLog] : [sourceLog];

  const commonFields = coder.encode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    [0, 100_000, options.agent, false, destination, 0, "0x"]
  );
  const receiptFields = coder.encode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    [options.receiptStatus ?? 1, 50_000, logs, "0x"]
  );

  const txType = options.txType ?? 2;
  const chunks = txType <= 2
    ? [commonFields, "0x", receiptFields]
    : [commonFields, "0x", "0x", receiptFields];

  return coder.encode(["uint8", "bytes[]"], [txType, chunks]);
}

describe("AttestedExecutionDecoder", function () {
  it("derives execution metrics from a valid type-2 receipt log", async function () {
    const [agent, reporter] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedExecutionDecoderHarness");
    const encoded = encodeAttestedTransaction({
      agent: agent.address,
      reporter: reporter.address
    });

    const decoded = await harness.decodeExecution(encoded, reporter.address);

    expect(decoded.agent).to.equal(agent.address);
    expect(decoded.executionId).to.equal(executionId);
    expect(decoded.success).to.equal(true);
    expect(decoded.volume).to.equal(volume);
    expect(decoded.observedAt).to.equal(observedAt);
  });

  it("supports the four-chunk receipt position used by type-3 transactions", async function () {
    const [agent, reporter] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedExecutionDecoderHarness");
    const encoded = encodeAttestedTransaction({
      agent: agent.address,
      reporter: reporter.address,
      txType: 3
    });

    const decoded = await harness.decodeExecution(encoded, reporter.address);
    expect(decoded.executionId).to.equal(executionId);
  });

  it("rejects a transaction sent to a different contract", async function () {
    const [agent, reporter, other] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedExecutionDecoderHarness");
    const encoded = encodeAttestedTransaction({
      agent: agent.address,
      reporter: reporter.address,
      destination: other.address
    });

    await expect(harness.decodeExecution(encoded, reporter.address)).to.be.revertedWith(
      "unexpected transaction destination"
    );
  });

  it("rejects a failed source transaction receipt", async function () {
    const [agent, reporter] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedExecutionDecoderHarness");
    const encoded = encodeAttestedTransaction({
      agent: agent.address,
      reporter: reporter.address,
      receiptStatus: 0
    });

    await expect(harness.decodeExecution(encoded, reporter.address)).to.be.revertedWith(
      "source transaction failed"
    );
  });

  it("rejects a matching signature emitted by another contract", async function () {
    const [agent, reporter, other] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedExecutionDecoderHarness");
    const encoded = encodeAttestedTransaction({
      agent: agent.address,
      reporter: reporter.address,
      emitter: other.address
    });

    await expect(harness.decodeExecution(encoded, reporter.address)).to.be.revertedWith(
      "expected exactly one execution event"
    );
  });

  it("rejects ambiguous transactions containing multiple matching logs", async function () {
    const [agent, reporter] = await ethers.getSigners();
    const harness = await ethers.deployContract("AttestedExecutionDecoderHarness");
    const encoded = encodeAttestedTransaction({
      agent: agent.address,
      reporter: reporter.address,
      duplicateLog: true
    });

    await expect(harness.decodeExecution(encoded, reporter.address)).to.be.revertedWith(
      "expected exactly one execution event"
    );
  });
});
