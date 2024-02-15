import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Typography, Grid, Button } from '@material-ui/core';
import { Table, TableColumn, Progress, ResponseErrorPanel, InfoCard,  } from '@backstage/core-components';
import useAsync from 'react-use/lib/useAsync';
import { useApi } from '@backstage/core-plugin-api';
import {mtaApiRef, Application, MTAApi} from '../../api/api.ts';
import AddLinkIcon from '@mui/icons-material/AddLink';
import { useEntity } from '@backstage/plugin-catalog-react';

type DenseApplicationTableProps = {
  applications: Application[];
  api: MTAApi;
  entityID: string;
}

export const DenseApplicationTable = ({ applications, api, entityID }: DenseApplicationTableProps) => {
  const columns: TableColumn[] = [
    { title: 'Name', field: 'name'},
    { title: 'Description', field: 'description' },
    { title: 'Assessed', field: 'assessed'},
    { title: 'mtaID', field: 'mtaID', hidden: true}
  ];

  const data = applications.map(application => {
    return {
      name: application.name,
      description: application.description,
      assessed: application.assessed,
      mtaID: application.id,
    }
  })

  return (
    // add Info cards here, that explain to attach an application to the enity.
    <>
      <InfoCard title="Link your Application to Component">
      <Table
        title="Application List"
        options={{ search: false, paging: true }}
        columns={columns}
        data={data}
        actions={[{
          icon: () => (
            <>
              <AddLinkIcon />
            </>
          ),
          tooltip: 'Connect Application to MTA Application',
          onClick: (event, rowData) => {
            console.log(rowData)
            console.log(event)
            if (Array.isArray(rowData)) {
              console.log("unable to handle array of row data")
            } else {
              const {mtaID} = rowData
              const res = api.saveApplicationEntity(mtaID, entityID);
            }
          }
        }]} />
      </InfoCard>
        </>
  )
}


type loginPageProps = {
  url: URL;
}

export const LoginToMTACard = ({ url }: loginPageProps) => {
  return <Grid item>
          <InfoCard title="Please Login">
            <Button variant='outlined' color='primary' size='large' href={url.toString()}>Login To MTA</Button>
          </InfoCard>
        </Grid>

}

type ApplicationCardProps = {
  application: Application
}
export const ApplicationCard = ({ application }: ApplicationCardProps) => {

  return <Grid item>
    <InfoCard title={application.name}></InfoCard>
  </Grid>

}

export const ExampleFetchComponent = () => {
  const api = useApi(mtaApiRef);
  const entity = useEntity();
  if (!entity) {
    // TODO: this is probably bad
    return <Progress />
  }
  const entityID = entity.entity.metadata.uid ?? ""

  const { value, loading, error } = useAsync(async (): Promise<Application[] | URL | Application> => {
    const application = (await api.getApplication(entityID))
    if (application) {
      if (application instanceof URL) {
        // HEre we need to redirect them to loging MTA.
        console.log("we have a url");
        return application;
      }
      return application;
    }

    // Would use fetch in a real world example
    const applications = (await api.getApplications())
    if (applications instanceof URL) {
      // HEre we need to redirect them to loging MTA.
      console.log("we have a url");
      return applications
    }
    
    return applications.map(application => {
      return {
        id: application.id,
        name: application.name,
        description: application.description,
        assessed: application.assessed,
      }
    })
  }, []);

  if (loading) {
    return <Progress />;
  } else if (error) {
    console.log(error.stack)
    return <ResponseErrorPanel error={error} />;
  } else if(!value) {
    const e = Error("fix me");
    return <ResponseErrorPanel title="unable to contact MTA" error={e} />;
  }
  
  if (value instanceof URL) {
    return <LoginToMTACard url={value}/>
  }

  if (Array.isArray(value)) {
    return <DenseApplicationTable applications={value || [] } api={api} entityID={entityID}/>;
  }

  return <ApplicationCard application={value} />
};
