import plugins = require('../plugins');
import posts = require('../posts');

interface DataType {
    mergeIntoTid: number,
    mergerUid: number,
    mergedTimestamp: number,
}

interface FieldsType {
    uid? : number;
    cid? : number;
    title?: string;
    tags?: string[];
    scheduled? : string;
    viewcount? : string;
}

interface CreateType {
    oldestTid : number;
    params : FieldsType;
}

interface OptionsType {
    mainTid? : number;
    newTopicTitle? : string;
}

interface TopicsType {
    merge : (tids : number[], uid : number, options : OptionsType) => Promise<number>;
    getTopicsFields : (tids : number[], fields : string[]) => Promise<FieldsType[]>;
    getTopicFields : (tid : number, fields : string[]) => Promise<FieldsType>;
    createNewTopic : (title : string, oldestTid : number) => Promise<number>;
    getPids : (tid : number) => Promise<number[]>;
    movePostToTopic : (uid : number, pid : number, mergeIntoTid : number) => Promise<void>;
    setTopicField : (tid : number, field : string, value : number) => Promise<void>;
    delete : (tid : number, uid : number) => Promise<void>;
    setTopicFields : (tid : number, data : DataType) => Promise<void>;
    updateViewCount : (mergeIntoTid : number, tids : number[]) => Promise<void>;
    findOldestTopic : (tids : number[]) => number;
    create : (data : FieldsType) => Promise<number>;
}

module.exports = function (Topics : TopicsType) {
    Topics.merge = async (tids, uid, options) => {
        options = options || {};

        const topicsData = await Topics.getTopicsFields(tids, ['scheduled']);
        if (topicsData.some(t => t.scheduled)) {
            throw new Error('[[error:cant-merge-scheduled]]');
        }

        const oldestTid = Topics.findOldestTopic(tids);
        let mergeIntoTid = oldestTid;
        if (options.mainTid) {
            mergeIntoTid = options.mainTid;
        } else if (options.newTopicTitle) {
            mergeIntoTid = await Topics.createNewTopic(options.newTopicTitle, oldestTid);
        }

        const otherTids = tids.sort((a, b) => a - b)
            .filter(tid => tid && tid !== mergeIntoTid);

        for (const tid of otherTids) {
            /* eslint-disable no-await-in-loop */
            const pids = await Topics.getPids(tid);
            for (const pid of pids) {
                await Topics.movePostToTopic(uid, pid, mergeIntoTid);
            }

            await Topics.setTopicField(tid, 'mainPid', 0);
            await Topics.delete(tid, uid);
            await Topics.setTopicFields(tid, {
                mergeIntoTid: mergeIntoTid,
                mergerUid: uid,
                mergedTimestamp: Date.now(),
            });
        }

        await Promise.all([
            posts.updateQueuedPostsTopic(mergeIntoTid, otherTids),
            Topics.updateViewCount(mergeIntoTid, tids),
        ]);

        await plugins.hooks.fire('action:topic.merge', {
            uid: uid,
            tids: tids,
            mergeIntoTid: mergeIntoTid,
            otherTids: otherTids,
        });
        return mergeIntoTid;
    };

    Topics.createNewTopic = async (title, oldestTid) => {
        const topicData = await Topics.getTopicFields(oldestTid, ['uid', 'cid']);
        const params = {
            uid: topicData.uid,
            cid: topicData.cid,
            title: title,
        };
        const result = await plugins.hooks.fire('filter:topic.mergeCreateNewTopic', {
            oldestTid: oldestTid,
            params: params,
        }) as CreateType;
        const tid = await Topics.create(result.params);
        return tid;
    };

    Topics.updateViewCount = async (mergeIntoTid, tids) => {
        const topicData = await Topics.getTopicsFields(tids, ['viewcount']);
        const totalViewCount = topicData.reduce(
            (count, topic) => count + parseInt(topic.viewcount, 10), 0
        );
        await Topics.setTopicField(mergeIntoTid, 'viewcount', totalViewCount);
    };

    Topics.findOldestTopic = function (tids) {
        return Math.min.apply(0, tids) as number;
    };
};
