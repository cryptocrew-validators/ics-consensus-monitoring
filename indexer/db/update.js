// src/db/update.js

import { ConsumerChainInfo, ProviderChainInfo } from '../../src/models/ChainInfo.js';
import {
  ConsensusState,
  Validators,
  Validator
} from '../../src/models/ConsensusState.js';
import { StakingValidators } from '../../src/models/StakingValidators.js';
import { 
  pubKeyToValcons,
  decodeVoteData
} from '../utils/utils.js';

import {
  runDatabaseQuery
} from './db.js';

async function saveStakingValidators (stakingValidators) {
  console.log('Saving stakingValidators to DB:',
    stakingValidators);

  try {
    // First, insert into StakingValidatorsMeta table
    const metaQuery = 'INSERT INTO StakingValidatorsMeta (timestamp, created_at, updated_at) VALUES (?, ?, ?)';
    const metaParams = [stakingValidators.timestamp, stakingValidators.created_at, stakingValidators.updated_at];
    const metaResult = await runDatabaseQuery(metaQuery,
      metaParams);

    console.log('Inserted into StakingValidatorsMeta with ID:',
      metaResult);

    // Now, insert each validator into StakingValidator table
    const validatorQuery = `
          INSERT INTO StakingValidator (
              stakingValidatorsMetaId, 
              operator_address, 
              consensus_pubkey_type, 
              consensus_pubkey_key, 
              consumer_signing_keys,
              jailed, status, tokens, delegator_shares, moniker, 
              identity, website, security_contact, details, 
              unbonding_height, unbonding_time, commission_rate, 
              commission_max_rate, commission_max_change_rate, 
              min_self_delegation
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

    for (const validator of stakingValidators.validators) {
      const validatorParams = [
        metaResult,
        validator.operator_address,
        validator.consensus_pubkey.type,
        validator.consensus_pubkey.key,
        JSON.stringify(validator.consumer_signing_keys),
        validator.jailed,
        validator.status,
        validator.tokens,
        validator.delegator_shares,
        validator.description.moniker,
        validator.description.identity,
        validator.description.website,
        validator.description.security_contact,
        validator.description.details,
        validator.unbonding_height,
        validator.unbonding_time,
        validator.commission.commission_rates.rate,
        validator.commission.commission_rates.max_rate,
        validator.commission.commission_rates.max_change_rate,
        validator.min_self_delegation
      ];
      await runDatabaseQuery(validatorQuery,
        validatorParams);
    }

    console.log('All validators inserted successfully.');
  } catch (error) {
    console.error('Error saving stakingValidators to DB:',
      error);
  }
}

async function getStakingValidatorsFromDB () {
  try {
    // Get the latest StakingValidatorsMeta entry
    const metaRow = await runDatabaseQuery('SELECT * FROM StakingValidatorsMeta ORDER BY id DESC LIMIT 1', [], 'get');

    if (!metaRow) {
      return [];
    }

    // Get all StakingValidator entries associated with the latest meta entry
    const validatorRows = await runDatabaseQuery('SELECT * FROM StakingValidator WHERE stakingValidatorsMetaId = ?', [metaRow.id], 'all');

    const result = {
      timestamp: metaRow.timestamp,
      validators: validatorRows
    };

    result.validators.forEach((validator) => {
      validator.consensus_pubkey = {
        '@type': validator.consensus_pubkey_type,
        key: validator.consensus_pubkey_key
      };
      validator.description = {
        moniker: validator.moniker,
        identity: validator.identity,
        website: validator.website,
        security_contact: validator.security_contact,
        details: validator.details
      };
      validator.commission = {
        commission_rates: {
          rate: validator.commission_rate,
          max_rate: validator.commission_max_rate,
          max_change_rate: validator.commission_max_change_rate
        },
        update_time: validator.commission_update_time || null
      };
    });

    return result;
  } catch (error) {
    console.error('Error fetching stakingValidators from DB:',
      error);
    throw error;
  }
}

async function saveMatchedValidators (matchedValidators) {
  console.log('Saving matchedValidators to DB:',
    matchedValidators);

  try {
    // Insert into MatchedValidators table
    const matchedQuery = 'INSERT INTO MatchedValidators (chainId, timestamp, created_at, updated_at) VALUES (?, ?, ?, ?)';
    const matchedParams = [matchedValidators.chainId, matchedValidators.timestamp, new Date().toISOString(), new Date().toISOString()];
    const matchedId = await runDatabaseQuery(matchedQuery,
      matchedParams); // ID of the last inserted row

    // Now, insert each validator into MatchedValidatorDetail table
    const detailQuery = 'INSERT INTO MatchedValidatorDetail (matchedValidatorsId, operator_address, consensus_address) VALUES (?, ?, ?)';
    for (const validator of matchedValidators.validators) {
      const detailParams = [matchedId, validator.operator_address, validator.consensus_address];
      await runDatabaseQuery(detailQuery,
        detailParams);
    }

    console.log('All matched validators inserted successfully.');
  } catch (error) {
    console.error('Error saving matchedValidators to DB:',
      error);
    throw error;
  }
}

async function getMatchedValidatorsFromDB () {
  try {
    // Get the latest MatchedValidators entry
    const matchedRow = await runDatabaseQuery('SELECT * FROM MatchedValidators ORDER BY id DESC LIMIT 1', [], 'get');

    if (!matchedRow) {
      return null;
    }

    // Get all MatchedValidatorDetail entries associated with the latest matched entry
    const validatorRows = await runDatabaseQuery('SELECT * FROM MatchedValidatorDetail WHERE matchedValidatorsId = ?', [matchedRow.id], 'all');

    const result = {
      chainId: matchedRow.chainId,
      timestamp: matchedRow.timestamp,
      validators: validatorRows
    };

    return result;
  } catch (error) {
    console.error('Error fetching matchedValidators from DB:',
      error);
    throw error;
  }
}

async function saveChainInfos (chainInfos, type) {
  console.log(`Saving ${type}ChainInfos to DB:`,
    chainInfos);

  try {
    const insertQuery = 'INSERT OR REPLACE INTO ChainInfo (chainId, rpcEndpoint, type, clientIds) VALUES (?, ?, ?, ?)';

    for (const info of chainInfos) {
      // Convert clientIds array to a JSON string for storage
      const clientIdsString = JSON.stringify(info.clientIds);
      const params = [info.chainId, info.rpcEndpoint, type, clientIdsString];
      await runDatabaseQuery(insertQuery,
        params);
      console.log(`Successfully inserted ${type}ChainInfo with chainId ${info.chainId}`);
    }

    console.log('All chainInfos inserted successfully.');
  } catch (error) {
    console.error(`Error saving ${type}ChainInfos to DB:`,
      error);
    throw error;
  }
}

async function getChainInfosFromDB (type) {
  try {
    const rows = await runDatabaseQuery('SELECT * FROM ChainInfo WHERE type = ?', [type], 'all');
    return rows;
  } catch (error) {
    console.error('DB Error:',
      error);
    throw error;
  }
}

/// ///////////////////////////////////// TODO

async function updateConsensusStateDB(consensusState, retainStates = 0) {
  try {
      await runDatabaseQuery('BEGIN TRANSACTION');

      const consensusStateId = await saveConsensusState(consensusState);
      console.log('[DEBUG] New consensusStateId for chain', consensusState.chainId, ':', consensusStateId);

      // Fetch the IDs of the states that are older than the `retainStates` count
      const selectPruneIdsQuery = `
        SELECT id 
        FROM ConsensusState 
        WHERE chainId = ?
        AND id != ?
        ORDER BY id ASC
        LIMIT -1 OFFSET ?
      `;
      const pruneIdsResult = await runDatabaseQuery(selectPruneIdsQuery, [consensusState.chainId, consensusStateId, retainStates], 'all');
      const pruneIds = pruneIdsResult.map(entry => entry.id);

      // Before pruning, ensure that the lastcommit data is correctly associated with the current state
      const currentConsensusState = await getConsensusStateByConsensusStateId(consensusStateId);
      if (currentConsensusState.validatorsGroupId && currentConsensusState.lastValidatorsGroupId) {
        if (pruneIds.length > 0) {
          await pruneConsensusStateDB(pruneIds, consensusState.chainId);
        }
      } else {
        console.error('Error: lastcommit data is not correctly associated with the current state.');
      }

      await runDatabaseQuery('COMMIT');
  } catch (err) {
      console.error('Error in updateConsensusStateDB:', err);
      try {
          await runDatabaseQuery('ROLLBACK');
      } catch (rollbackErr) {
          console.error('[DEBUG] Error on ROLLBACK', rollbackErr);
          throw rollbackErr;
      }
      throw err;
  }
}


async function updateValidatorsGroupWithProposerId(validatorsGroupId, proposerId) {
  const query = `
      UPDATE ValidatorsGroup
      SET proposerId = ?
      WHERE id = ?
  `;
  console.log('setting proposerId ' + proposerId + ' in ValidatorsGroup ' + validatorsGroupId)   
  await runDatabaseQuery(query, [proposerId, validatorsGroupId]);
}

async function saveValidatorsAndVotes(consensusState, consensusStateId, type) {
  let validatorsGroupId;
  let proposer;

  if (type === 'current') {
      // Identify the proposer but don't save yet
      for (let i = 0; i < consensusState.validators.validators.length; i++) {
          const validator = consensusState.validators.validators[i];
          if (validator.address === consensusState.validators.proposer.address) {
              proposer = validator;
          }
      }

      // Save the validators group without the proposerId
      validatorsGroupId = await saveValidatorsGroup(consensusStateId, null, 'current');

      // Now, save the proposer with the correct validators group ID
      const proposerId = await saveValidator(proposer, validatorsGroupId);

      // Update the validators group with the correct proposerId
      await updateValidatorsGroupWithProposerId(validatorsGroupId, proposerId);

      // Save Rounds Group
      const roundsGroupId = await saveRoundsGroup(consensusStateId, 'current');

      for (let f = 0; f < consensusState.votes.length; f++) {
        
        // Save Round with roundsGroupId reference
        const roundId = await saveRound(roundsGroupId, f);

        // Continue with the rest of the logic for saving other validators and votes.
        // Votes reference validatorId and roundId
        for (let i = 0; i < consensusState.validators.validators.length; i++) {
          const validator = consensusState.validators.validators[i];
          let validatorId;
          if (validator.address !== consensusState.validators.proposer.address) {
            validatorId = await saveValidator(validator, validatorsGroupId);
          } else {
            validatorId = proposerId;
            console.log('proposing Validator with validatorId ' + validatorId + ' already saved');
          }

          const votes = consensusState.votes[f];
          await saveVote(votes.prevotes[i], 'prevote', validatorId, roundId);
          await saveVote(votes.precommits[i], 'precommit', validatorId, roundId);  
          if (votes.precommits[i] !== 'nil-Vote' && consensusState.chainId === 'cosmoshub-4') {
            console.log('eee')
          }

        }
      }
  }

  if (type === 'last') {
    // Identify the last proposer but don't save yet
    for (let i = 0; i < consensusState.last_validators.validators.length; i++) {
        const validator = consensusState.last_validators.validators[i];
        if (validator.address === consensusState.last_validators.proposer.address) {
            proposer = validator;
        }
    }

    // Save the last validators group without the proposerId
    validatorsGroupId = await saveValidatorsGroup(consensusStateId, null, 'last');

    // Now, save the last proposer with the correct validators group ID
    const proposerId = await saveValidator(proposer, validatorsGroupId);

    // Update the last validators group with the correct proposerId
    await updateValidatorsGroupWithProposerId(validatorsGroupId, proposerId);
    console.log('updated lastProposerId for validatorsGroupId ' + validatorsGroupId)

    // Save finalized RoundsGroup and one Round
    const roundsGroupId = await saveRoundsGroup(consensusStateId, 'last');
    const roundId = await saveRound(roundsGroupId, -1);

    // Continue with the rest of the logic for saving other validators and last_commit votes
    for (let i = 0; i < consensusState.last_validators.validators.length; i++) {
        const validator = consensusState.last_validators.validators[i];
        let validatorId;
        if (validator.address !== consensusState.last_validators.proposer.address) {
          validatorId = await saveValidator(validator, validatorsGroupId);
        } else if (validator.address === consensusState.last_validators.proposer.address) {
          validatorId = proposerId;
        }

        await saveVote(consensusState.last_commit.votes[i], 'lastcommit', validatorId, roundId);
    }
  }

  return validatorsGroupId;
}

async function saveConsensusState(consensusState) {
  console.log('Starting saveConsensusState...');

  const query = `
      INSERT INTO ConsensusState (
        chainId, 
        timestamp, 
        height, 
        round, 
        step, 
        start_time, 
        commit_time, 
        validatorsGroupId, 
        lastValidatorsGroupId, 
        proposal, 
        proposal_block_parts_header, 
        locked_block_parts_header, 
        valid_block_parts_header, 
        votes, 
        last_commit
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  const params = [
      consensusState.chainId,
      consensusState.timestamp,
      consensusState.height,
      consensusState.round,
      consensusState.step,
      consensusState.start_time,
      consensusState.commit_time,
      null,
      null,
      JSON.stringify(consensusState.proposal),
      JSON.stringify(consensusState.proposal_block_parts_header),
      JSON.stringify(consensusState.locked_block_parts_header),
      JSON.stringify(consensusState.valid_block_parts_header),
      JSON.stringify(consensusState.votes),
      JSON.stringify(consensusState.last_commit),
  ];

  const consensusStateId = await runDatabaseQuery(query, params);

  const validatorsGroupId = await saveValidatorsAndVotes(consensusState, consensusStateId, 'current');
  const lastValidatorsGroupId = await saveValidatorsAndVotes(consensusState, consensusStateId, 'last');
  console.log('saved validatorsGroup and lastValidatorsGroup for consensusStateId: ' + consensusStateId)

  const updateQuery = `
      UPDATE ConsensusState
      SET validatorsGroupId = ?, lastValidatorsGroupId = ?
      WHERE id = ?;
  `;

  const updateParams = [validatorsGroupId, lastValidatorsGroupId, consensusStateId];
  await runDatabaseQuery(updateQuery, updateParams);
  console.log('updated consensusStateId ' + consensusStateId + ' with validatorsGroupId: ' + validatorsGroupId + ' and lastValidatorsGroupId ' + lastValidatorsGroupId);

  return consensusStateId;
}

async function saveRoundsGroup(consensusStateId, type = null) {
  const query = `
      INSERT INTO RoundsGroup (consensusStateId, type)
      VALUES (?, ?);
  `;
  const params = [
      consensusStateId,
      type
  ];

  const roundsGroupId = await runDatabaseQuery(query, params);
  console.log(`saved roundsGroup ${roundsGroupId} of type ${type}`);
  return roundsGroupId;
}

async function saveRound(roundsGroupId, rundNumber = -1) {
  const query = `
      INSERT INTO Round (roundsGroupId, roundNumber)
      VALUES (?, ?);
  `;
  const params = [
    roundsGroupId,
    rundNumber
  ];

  const roundId = await runDatabaseQuery(query, params);
  console.log(`saved roundId ${roundId} (roundNumber ${rundNumber})`);
  return roundId;
}

async function saveValidatorsGroup(consensusStateId, proposerId = null, type) {
  const query = `
      INSERT INTO ValidatorsGroup (type, consensusStateId, proposerId)
      VALUES (?, ?, ?);
  `;
  const params = [
      type,
      consensusStateId,
      proposerId
  ];

  const validatorsGroupId = await runDatabaseQuery(query, params);
  console.log(`saved ValidatorsGroup ${validatorsGroupId}`);
  return validatorsGroupId;
}


async function saveValidator(validator, validatorsGroupId) {
  const valconsAddress = pubKeyToValcons(validator.pub_key.value, 'cosmos');
  const query = `
      INSERT INTO Validator (validatorsGroupId, address, pub_key, consensusAddress, voting_power, proposer_priority)
      VALUES (?, ?, ?, ?, ?, ?);
  `;
  const params = [
      validatorsGroupId,
      validator.address,
      JSON.stringify(validator.pub_key),
      valconsAddress,
      validator.voting_power,
      validator.proposer_priority
  ];
  
  const validatorId = await runDatabaseQuery(query, params);
  
  return validatorId;
}


async function saveVote(vote, type, validatorId, roundId) {
  let voteString = vote;
  let voteHash, index, address, height, round, msgType, voteType, date;
  if (voteString !== 'nil-Vote'){
    [index, address, height, round, msgType, voteType, voteHash, date] = decodeVoteData(voteString);
  } else {
    voteHash = voteString;
  }
  const query = `
      INSERT INTO Votes (validatorId, roundId, type, vote, voteString)
      VALUES (?, ?, ?, ?, ?);
  `;

  const params = [
      validatorId,
      roundId,
      type,
      voteHash,
      voteString
  ];

  await runDatabaseQuery(query, params);
}

async function getConsensusStateByConsensusStateId(consensusStateId) {
  const query = `
      SELECT * FROM ConsensusState
      WHERE id = ?;
  `;
  const params = [consensusStateId];
  const result = await runDatabaseQuery(query, params, 'get');
  return result;
}

async function savePeer (peer) {
  const query = `
      INSERT INTO Peer (chainId, timestamp, node_address, peer_stateId)
      VALUES (?, ?, ?, ?);
  `;
  const peerStateId = await savePeerState(peer.peer_state);
  const params = [
    peer.chainId,
    peer.timestamp,
    peer.node_address,
    peerStateId
  ];

  await runDatabaseQuery(query,
    params);
}

///////////////////////////////
//////////////////// REFACTORED
async function loadConsensusStateFromDB(chainId) {
  const consensusStateRow = await fetchConsensusState(chainId);
  if (!consensusStateRow) return null;

  const validatorsGroup = await fetchValidatorsGroup(consensusStateRow.validatorsGroupId);
  const lastValidatorsGroup = await fetchValidatorsGroup(consensusStateRow.lastValidatorsGroupId);

  const rounds = await fetchRoundsForConsensusState(consensusStateRow.id);

  return new ConsensusState({
      height: consensusStateRow.height,
      round: consensusStateRow.round,
      step: consensusStateRow.step,
      start_time: consensusStateRow.start_time,
      commit_time: consensusStateRow.commit_time,
      validators: validatorsGroup,
      last_validators: lastValidatorsGroup,
      proposal: consensusStateRow.proposal,
      proposal_block_parts_header: consensusStateRow.proposal_block_parts_header,
      locked_block_parts_header: consensusStateRow.locked_block_parts_header,
      valid_block_parts_header: consensusStateRow.valid_block_parts_header,
      votes: consensusStateRow.votes,
      last_commit: consensusStateRow.last_commit
  }, chainId, consensusStateRow.timestamp);
}

async function fetchConsensusState(chainId) {
  const query = 'SELECT * FROM ConsensusState WHERE chainId = ?';
  return await runDatabaseQuery(query, [chainId], 'get');
}

async function fetchValidatorsGroup(validatorsGroupId) {
  const query = 'SELECT * FROM ValidatorsGroup WHERE id = ?';
  const validatorsGroupRow = await runDatabaseQuery(query, [validatorsGroupId], 'get');

  const validatorsQuery = 'SELECT * FROM Validator WHERE validatorsGroupId = ?';
  const validatorsRows = await runDatabaseQuery(validatorsQuery, [validatorsGroupId], 'all');

  const validators = validatorsRows.map(validatorRow => new Validator(validatorRow));

  const proposerValidator = validators.find(v => v.id === validatorsGroupRow.proposerId);

  return new Validators({
      validators: validators,
      proposer: proposerValidator
  });
}

async function fetchRoundsForConsensusState(consensusStateId) {
  const query = 'SELECT * FROM RoundsGroup WHERE consensusStateId = ?';
  const roundsGroupRows = await runDatabaseQuery(query, [consensusStateId], 'all');

  const rounds = [];
  for (const roundsGroupRow of roundsGroupRows) {
      const roundQuery = 'SELECT * FROM Round WHERE roundsGroupId = ?';
      const roundRows = await runDatabaseQuery(roundQuery, [roundsGroupRow.id], 'all');
      rounds.push(...roundRows);
  }

  return rounds;
}
//////////////////// REFACTORED
///////////////////////////////

/*
// TODO: REFACTOR THIS
async function loadConsensusStateFromDB(chainId) {
  const consensusStateQuery = 'SELECT * FROM ConsensusState WHERE chainId = ?';
  const consensusStateRow = await runDatabaseQuery(consensusStateQuery, [chainId], 'get');

  if (!consensusStateRow) {
    return null;
  }

  const roundStateQuery = 'SELECT * FROM RoundState WHERE consensusStateId = ?';
  const roundStatesRows = await runDatabaseQuery(roundStateQuery, [consensusStateRow.id], 'all');

  const roundStates = await Promise.all(roundStatesRows.map(async (roundStateRow) => {
    const validatorsGroupQuery = 'SELECT * FROM ValidatorsGroup WHERE roundStateId = ?';
    const validatorsGroupRow = await runDatabaseQuery(validatorsGroupQuery, [roundStateRow.id], 'get');
    const lastValidatorsGroupRow = await runDatabaseQuery(validatorsGroupQuery, [roundStateRow.lastValidatorsGroupId], 'get');

    const validatorsQuery = 'SELECT * FROM Validator WHERE validatorsGroupId = ?';
    const validatorsRows = await runDatabaseQuery(validatorsQuery, [validatorsGroupRow.id], 'all');
    const lastValidatorsRows = await runDatabaseQuery(validatorsQuery, [lastValidatorsGroupRow.id], 'all');

    const validators = validatorsRows.map(validatorRow => new Validator(validatorRow, chainId, validatorRow.timestamp));
    const lastValidators = lastValidatorsRows.map(validatorRow => new Validator(validatorRow, chainId, validatorRow.timestamp));

    const proposerValidator = validators.find(v => v.address === validatorsGroupRow.proposer);

    const validatorsGroup = new Validators({
      validators: validators,
      proposer: proposerValidator
    }, chainId, validatorsGroupRow.timestamp);

    const lastValidatorsGroup = new Validators({
      validators: lastValidators,
      proposer: lastValidators.find(v => v.address === lastValidatorsGroupRow.proposer)
    }, chainId, lastValidatorsGroupRow.timestamp);

    return new RoundState({
      height: roundStateRow.height,
      round: roundStateRow.round,
      step: roundStateRow.step,
      start_time: roundStateRow.start_time,
      commit_time: roundStateRow.commit_time,
      validators: validatorsGroup,
      proposal: roundStateRow.proposal,
      proposal_block_parts_header: roundStateRow.proposal_block_parts_header,
      locked_block_parts_header: roundStateRow.locked_block_parts_header,
      valid_block_parts_header: roundStateRow.valid_block_parts_header,
      votes: roundStateRow.votes,
      last_commit: roundStateRow.last_commit,
      last_validators: lastValidatorsGroup
    }, chainId, roundStateRow.timestamp);
  }));

  return new ConsensusState({
    round_state: roundStates
  }, chainId, consensusStateRow.timestamp);
}
*/

async function pruneConsensusStateDB(pruneIds, chainId) {
  console.log(`Pruning entries with IDs: ${pruneIds.join(', ')} for chainId: ${chainId}`);

  const deleteConsensusStateQuery = `
      DELETE FROM ConsensusState 
      WHERE chainId = ? 
      AND id IN (${pruneIds.map(() => '?').join(', ')})
  `;
  await runDatabaseQuery(deleteConsensusStateQuery, [chainId, ...pruneIds], 'delete');
  
  // Log the pruned IDs
  console.log(`Pruned ConsensusState entries with IDs: ${pruneIds.join(', ')} for chainId: ${chainId}`);
}






export {
  saveStakingValidators,
  getStakingValidatorsFromDB,
  saveMatchedValidators,
  getMatchedValidatorsFromDB,
  getChainInfosFromDB,
  saveChainInfos,
  updateConsensusStateDB,
  loadConsensusStateFromDB
};
