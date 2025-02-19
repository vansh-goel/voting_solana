import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Voting } from "../target/types/voting";

const IDL = require("../target/idl/voting.json");
const PROGRAM_ID = new PublicKey(IDL.address);

describe("Voting", () => {
  let context;
  let provider;
  let votingProgram: anchor.Program<Voting>;

  beforeAll(async () => {
    context = await startAnchor(
      "",
      [{ name: "voting", programId: PROGRAM_ID }],
      []
    );
    provider = new BankrunProvider(context);
    votingProgram = new anchor.Program<Voting>(IDL, provider);
  });

  it("initializes a poll", async () => {
    await votingProgram.methods
      .initializePoll(
        new anchor.BN(1),
        "What is your favorite color?",
        new anchor.BN(100),
        new anchor.BN(1739370789)
      )
      .rpc();

    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      votingProgram.programId
    );

    const poll = await votingProgram.account.poll.fetch(pollAddress);

    console.log(poll);

    expect(poll.pollId.toNumber()).toBe(1);
    expect(poll.description).toBe("What is your favorite color?");
    expect(poll.pollStart.toNumber()).toBe(100);
  });

  it("initializes candidates", async () => {
    await votingProgram.methods
      .initializeCandidate("Pink", new anchor.BN(1))
      .rpc();
    await votingProgram.methods
      .initializeCandidate("Blue", new anchor.BN(1))
      .rpc();

    const [pinkAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Pink")],
      votingProgram.programId
    );
    const pinkCandidate = await votingProgram.account.candidate.fetch(
      pinkAddress
    );
    console.log(pinkCandidate);
    expect(pinkCandidate.candidateVotes.toNumber()).toBe(0);
    expect(pinkCandidate.candidateName).toBe("Pink");

    const [blueAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
      votingProgram.programId
    );
    const blueCandidate = await votingProgram.account.candidate.fetch(
      blueAddress
    );
    console.log(blueCandidate);
    expect(blueCandidate.candidateVotes.toNumber()).toBe(0);
    expect(blueCandidate.candidateName).toBe("Blue");
  });

  it("vote candidates", async () => {
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);
    let voterId = provider.wallet.publicKey;
    await votingProgram.methods.vote("Blue", new anchor.BN(1), voterId).rpc();

    const [blueAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
      votingProgram.programId
    );
    const blueCandidate = await votingProgram.account.candidate.fetch(
      blueAddress
    );
    console.log(blueCandidate);
    expect(blueCandidate.candidateVotes.toNumber()).toBe(1);
    expect(blueCandidate.candidateName).toBe("Blue");
  });
  it("prevents double voting by the same user", async () => {
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);
    const candidateName = "Pink";
    const pollId = new anchor.BN(1);
    const voterId = provider.wallet.publicKey;

    // Cast the first vote
    await votingProgram.methods.vote(candidateName, pollId, voterId).rpc();

    // Attempt to cast a second vote
    try {
      await votingProgram.methods.vote(candidateName, pollId, voterId).rpc();
      throw new Error("Double voting was allowed");
    } catch (err) {
      if (err instanceof anchor.AnchorError) {
        expect(err.error.errorMessage).toContain("Voter has already voted");
      } else {
        throw err;
      }
    }

    // Fetch candidate account
    const [candidateAddress] = PublicKey.findProgramAddressSync(
      [pollId.toArrayLike(Buffer, "le", 8), Buffer.from(candidateName)],
      votingProgram.programId
    );
    const candidateAccount = await votingProgram.account.candidate.fetch(
      candidateAddress
    );

    // Verify vote count
    expect(candidateAccount.candidateVotes.toNumber()).toBe(1);
    expect(candidateAccount.candidateName).toBe(candidateName);
  });
});
