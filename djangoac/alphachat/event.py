from alphachat.debug import log
from couchdbkit import Consumer, Document

def get_seq(db):
    return db.info()['update_seq']

class Timeout(Exception): pass

def wait_for_change(doc, since=0, timeout=60000):
    assert int(since) > 0
    db = doc.get_db()
    log("update_seq: %s"%get_seq(db))
    log("info: wait_for_change on _id: %s, _rev: %s" % (doc['_id'], doc['_rev']))
    docid = doc['_id']
    rev = doc['_rev']
    c = Consumer(db)
    
    log('fetch: started...')
    r = c.fetch(filter="alphachat/generic",
                by_key='_id', by_value=docid, since=since)
    log('fetch: %s'%r)
    if r['results']:
        rev = r['results'][0]['changes'][0]['rev']
        if rev != doc['_rev']:
            # we already have our change
            log('WARNING: %s changed really quickly' % doc['_id'])
            return Document(db[doc['_id']])

    last_seq = r['last_seq']
    log('poll: started...')
    r = c.wait_once(filter="alphachat/generic",
                    by_key='_id', by_value=docid,
                    since = last_seq,
                    timeout=timeout)
    log('poll: %s'%r)
    if len(r['results']) > 0:
        return Document(db[doc['_id']])
    else:
        raise Timeout

def wait_for_changes(db, doc_type=None, by_key=None, by_value=None, since=0, timeout=60000):
    assert int(since) > 0
    log('>>> wait_for_changes %s'%since)
    c = Consumer(db)
    r = c.wait_once(filter="alphachat/generic",
                    doc_type=doc_type,
                    by_key=by_key, by_value=by_value,
                    since=since,
                    timeout=timeout)
    # we should be able to fetchall these in one POST
    # http://wiki.apache.org/couchdb/HTTP_view_API
    ids = map(lambda m: m['id'], r['results'])
    docs = map(lambda i: Document(db.get(i)), ids)
    log('<<< wait_for_changes %s'%since)
    return docs, r['last_seq']

if __name__ == '__main__':
    s = Server('http://localhost:5984')
    db = s.get_or_create_db('alphachat')
    Document.set_db(db)
    doc = Document(db['monkey'])
    since = get_seq(db)
    print "go change doc '%s' now, or wait until after the fetch" % doc['_id']
    from time import sleep
    sleep(10)
    try:
        doc = wait_for_change(doc, since, 10000)
    except Timeout:
        print "TIMEOUT"

    print 'doc:',doc
